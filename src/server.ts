import 'dotenv/config';
import Fastify from 'fastify';
import rawBody from 'fastify-raw-body';
import { verifyDiscordSignature } from './middleware/verifyDiscord';
import { router } from './handlers/router';
import {
  registerCommandsForGuild,
  getAllGuilds,
} from './services/commandRegistration';

const app = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  },
  requestTimeout: 2500, // 2.5 seconds - Discord requires response within 3 seconds
});

// Global error handler to catch parsing errors before route handlers
app.setErrorHandler((error, request, reply) => {
  request.log.error({ 
    error, 
    url: request.url,
    method: request.method,
    contentType: request.headers['content-type']
  }, 'Unhandled error before route handler');
  
  if (!reply.sent) {
    reply.code(400).send({ error: 'Bad request' });
  }
});

// Health check route
app.get('/health', async (request, reply) => {
  return { status: 'ok' };
});

// Admin endpoint for command registration
app.post('/admin/register-commands', async (request, reply) => {
  try {
    const guildId = (request.query as any)?.guildId as string | undefined;

    if (guildId) {
      // Register commands for specific guild
      app.log.info(`Registering commands for guild: ${guildId}`);
      const result = await registerCommandsForGuild(guildId);
      return {
        success: true,
        results: [result],
      };
    } else {
      // Register commands for all guilds
      app.log.info('Registering commands for all guilds');
      const guildIds = await getAllGuilds();
      app.log.info(`Found ${guildIds.length} guild(s)`);

      const results = await Promise.all(
        guildIds.map((id) => registerCommandsForGuild(id))
      );

      return {
        success: true,
        results,
        summary: {
          totalGuilds: guildIds.length,
          totalRegistered: results.reduce(
            (sum, r) => sum + r.registered.length,
            0
          ),
          totalSkipped: results.reduce((sum, r) => sum + r.skipped.length, 0),
          totalErrors: results.reduce((sum, r) => sum + r.errors.length, 0),
        },
      };
    }
  } catch (error: any) {
    app.log.error({ error }, 'Failed to register commands');
    reply.code(500);
    return {
      success: false,
      error: error.message || String(error),
    };
  }
});

// Discord interactions webhook
// Register rawBody plugin in a scoped context for this route
app.register(async function (fastify) {
  // Register fastify-raw-body plugin to capture raw body for signature verification
  await fastify.register(rawBody, {
    field: 'rawBody', // Property name on request object
    global: false, // Only enable for routes that explicitly request it
    encoding: 'utf8', // Return rawBody as string (matches signature verification needs)
    runFirst: true, // Capture raw body before any parsing hooks
  });

  fastify.post('/interactions', { config: { rawBody: true } }, async (request, reply) => {
    // Log immediately when request arrives - this helps track all incoming requests
    request.log.info({
      method: request.method,
      url: request.url,
      contentType: request.headers['content-type'],
      hasRawBody: !!(request as any).rawBody,
      rawBodyType: typeof (request as any).rawBody,
    }, 'Discord interaction received');
    
    try {
      // Verify Discord signature (needs rawBody)
      await verifyDiscordSignature(request, reply);
      
      // If verification failed, reply was already sent
      if (reply.sent) {
        return;
      }

      // Route the interaction (body is already parsed JSON)
      // Discord requires a response within 3 seconds, so we need to respond quickly
      const response = await router(request.body as any);
      return response;
    } catch (error: any) {
      // Log the error for debugging
      request.log.error({ error, body: request.body }, 'Error processing interaction');
      
      // If we haven't sent a response yet, send an error response
      // This prevents Discord from showing "application did not respond"
      if (!reply.sent) {
        // Check if this is a PING (type 1) - respond with PONG
        const interaction = request.body as any;
        if (interaction?.type === 1) {
          return { type: 1 }; // PONG
        }
        
        // For other interactions, return an error response
        return {
          type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
          data: {
            content: 'An error occurred while processing your request. Please try again.',
            flags: 64, // Ephemeral
          },
        };
      }
      
      // If reply was already sent, just log and return
      return;
    }
  });
});

const PORT = parseInt(process.env.PORT || '3000', 10);

app.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`Server listening on ${address}`);
});

