import { FastifyRequest, FastifyReply } from 'fastify';
import nacl from 'tweetnacl';

const PUBLIC_KEY = process.env.DISCORD_PUBLIC_KEY;

if (!PUBLIC_KEY) {
  throw new Error('DISCORD_PUBLIC_KEY environment variable is required');
}

export async function verifyDiscordSignature(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const signature = request.headers['x-signature-ed25519'] as string;
  const timestamp = request.headers['x-signature-timestamp'] as string;
  const rawBody = request.rawBody as Buffer | string | undefined;

  if (!signature || !timestamp || !rawBody) {
    request.log.warn({
      hasSignature: !!signature,
      hasTimestamp: !!timestamp,
      hasRawBody: !!rawBody,
      rawBodyType: typeof rawBody,
      contentType: request.headers['content-type'],
      url: request.url,
    }, 'Missing signature headers or rawBody');
    reply.code(401).send({ error: 'Missing signature headers' });
    return;
  }

  try {
    // Combine timestamp and raw body (matching n8n workflow)
    // Handle both Buffer and string types for rawBody
    const bodyString = Buffer.isBuffer(rawBody) 
      ? rawBody.toString('utf-8') 
      : typeof rawBody === 'string' 
        ? rawBody 
        : String(rawBody);
    
    const message = timestamp + bodyString;
    const publicKeyBytes = Buffer.from(PUBLIC_KEY!, 'hex');
    const signatureBytes = Buffer.from(signature, 'hex');

    const isValid = nacl.sign.detached.verify(
      Buffer.from(message, 'utf-8'),
      signatureBytes,
      publicKeyBytes
    );

    if (!isValid) {
      request.log.warn('Invalid signature verification');
      reply.code(401).send({ error: 'Invalid signature' });
      return;
    }
  } catch (error) {
    request.log.error({ error }, 'Signature verification failed');
    reply.code(401).send({ error: 'Signature verification failed' });
    return;
  }
}

