import {
  CommandInteraction,
  InteractionResponseType,
  ButtonStyle,
} from '../types/discord';
import { getGuildSettings, createRequest } from '../services/database';
import { parseCardRequest } from '../services/openai';
import { fetchAllCardData } from '../services/scryfall';
import { sanitizeInput } from '../utils/sanitize';
import { generatePDF, generatePDFFilename } from '../utils/pdfGenerator';
import {
  sendDiscordMessage,
  updateInteractionResponse,
  followUpMessage,
} from '../services/discord';
import { CardDataWithScryfall } from '../types/database';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleRequestList(
  interaction: CommandInteraction
): Promise<any> {
  // 1. Immediate response (within 3 seconds)
  const immediateResponse = {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content:
        "MTGRequestBot here! I'm processing your request. If you're still seeing this after 15 minutes, please try again or request cards directly.",
    },
  };

  // Process in background
  processRequestList(interaction).catch((error) => {
    console.error('Error processing request-list:', error);
  });

  return immediateResponse;
}

async function processRequestList(
  interaction: CommandInteraction
): Promise<void> {
  try {
    const guildId = interaction.guild_id;
    if (!guildId) {
      await updateInteractionResponse(
        interaction.application_id,
        interaction.token,
        'This command can only be used in a server.',
        [
          {
            title: 'Error',
            description: 'This command requires a server context.',
            color: 15158332, // Red
          },
        ]
      );
      return;
    }

    // 2. Validation - Check guild settings
    let settings;
    try {
      settings = await getGuildSettings(guildId);
    } catch (error: any) {
      console.error('Database error when fetching guild settings:', error);
      // Check if it's a connection error
      if (error.code === 'ENOTFOUND' || error.message?.includes('getaddrinfo')) {
        await updateInteractionResponse(
          interaction.application_id,
          interaction.token,
          'Database connection error. Please check your database configuration.',
          [
            {
              title: 'Database Error',
              description: `Connection failed: ${error.message || 'Unable to connect to database'}. Please verify your DATABASE_URL_DEV environment variable is set correctly.`,
              color: 15158332, // Red
            },
          ]
        );
        return;
      }
      // Re-throw other database errors
      throw error;
    }
    
    if (!settings || !settings.request_channel || !settings.task_channel) {
      await updateInteractionResponse(
        interaction.application_id,
        interaction.token,
        'This request will not be processed. Bot setup incomplete. Commands `/set-request-channel` and `/set-task-channel` need to be executed before requests can be made.',
        [
          {
            title: 'Setup Incomplete',
            description:
              'Please configure the bot using `/set-request-channel` and `/set-task-channel` commands.',
            color: 15158332, // Red
          },
        ]
      );
      return;
    }

    // Check if command issued in correct channel
    if (interaction.channel_id !== settings.request_channel) {
      await updateInteractionResponse(
        interaction.application_id,
        interaction.token,
        `Error: Command issued in wrong channel. Please try again in <#${settings.request_channel}>`,
        [
          {
            title: 'Wrong Channel',
            description: `This command must be used in <#${settings.request_channel}>`,
            color: 15158332, // Red
          },
        ]
      );
      return;
    }

    // 3. Get user input
    const userInput = interaction.data.options?.[0]?.value as string;
    if (!userInput) {
      await updateInteractionResponse(
        interaction.application_id,
        interaction.token,
        'Please provide a list of cards to request.',
        [
          {
            title: 'Missing Input',
            description: 'You must provide a card list in the command.',
            color: 15158332, // Red
          },
        ]
      );
      return;
    }

    // 4. Sanitize input
    const sanitizedInput = sanitizeInput(userInput);

    // 5. Parse with OpenAI
    let parsedCards;
    try {
      parsedCards = await parseCardRequest(sanitizedInput);
    } catch (error) {
      console.error('OpenAI parsing error:', error);
      await updateInteractionResponse(
        interaction.application_id,
        interaction.token,
        'Sorry, I encountered an error parsing your card request. Please try again.',
        [
          {
            title: 'Parsing Error',
            description: 'Unable to process your card list. Please check the format and try again.',
            color: 15158332, // Red
          },
        ]
      );
      return;
    }

    // 6. Fetch card data from Scryfall (before saving to DB)
    let cardsWithData: CardDataWithScryfall[];
    try {
      cardsWithData = await fetchAllCardData(parsedCards.card_data);
    } catch (error) {
      console.error('Scryfall fetching error:', error);
      // Continue with cards even if Scryfall fails
      cardsWithData = parsedCards.card_data.map((card) => ({
        ...card,
        set: 'no match',
        legalities_standard: '',
        is_over_5_dollars: '',
        cmc: '',
        colors: '',
        primary_type: '',
      }));
    }

    // 7. Save to database (only after successful processing)
    const requestId = await createRequest(
      guildId,
      interaction.token,
      interaction.data.id,
      interaction.channel_id,
      interaction.member?.user.id || interaction.user?.id || '',
      interaction,
      parsedCards
    );

    // 8. Generate PDF
    const userNick =
      interaction.member?.nick ||
      interaction.member?.user.global_name ||
      interaction.member?.user.username ||
      interaction.user?.username ||
      'Unknown';
    const username =
      interaction.member?.user.username || interaction.user?.username || 'Unknown';

    let pdfBuffer: Buffer;
    try {
      pdfBuffer = await generatePDF({
        requestId,
        userNick,
        username,
        requestNote: parsedCards.user_note,
        cardData: cardsWithData,
        originalComment: sanitizedInput,
      });
    } catch (error) {
      console.error('PDF generation error:', error);
      // Continue without PDF if generation fails
      pdfBuffer = Buffer.from('');
    }

    // 9. Post to task channel
    await sleep(500);
    const pdfFilename = generatePDFFilename(requestId, userNick);
    const pdfFile = pdfBuffer.length > 0
      ? [{ name: pdfFilename, data: pdfBuffer }]
      : undefined;

    try {
      await sendDiscordMessage(
        settings.task_channel,
        `A new card request has been submitted by <@${interaction.member?.user.id || interaction.user?.id}>. ${pdfFile ? 'A downloadable PDF is attached for your review.' : 'PDF generation failed, but request was processed.'}`,
        [
          {
            title: pdfFile ? 'New Card Request - Attached' : 'New Card Request',
            description: pdfFile
              ? 'Please download the attached file to view the detailed request.'
              : 'PDF generation failed. Check logs for details.',
            color: 3447003, // Blue
          },
        ],
        [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: ButtonStyle.PRIMARY,
                label: 'Mark as Complete',
                custom_id: `complete-request_${requestId}`,
              },
              {
                type: 2,
                style: ButtonStyle.DANGER,
                label: 'Cancel Request',
                custom_id: `cancel-request_${requestId}`,
              },
              {
                type: 2,
                style: ButtonStyle.SECONDARY,
                label: 'Not printed yet',
                custom_id: `print-request_${requestId}`,
              },
            ],
          },
        ],
        pdfFile
      );
    } catch (error: any) {
      // If sending to task channel fails, still update the user but log the error
      console.error('Failed to send message to task channel:', error);
      
      // Try to provide helpful error message
      if (error.message?.includes('Missing Access') || error.message?.includes('403')) {
        await updateInteractionResponse(
          interaction.application_id,
          interaction.token,
          `⚠️ Your request was saved, but there was an issue posting it to the task channel. Please check that the bot has permission to send messages in <#${settings.task_channel}>. The bot needs "View Channel", "Send Messages", and "Attach Files" permissions.`,
          [
            {
              title: 'Permission Error',
              description: `The bot cannot post to the task channel (<#${settings.task_channel}>). Please contact an administrator to fix the bot's permissions.`,
              color: 15158332, // Red
            },
          ]
        );
      } else {
        // Re-throw other errors to be caught by outer catch block
        throw error;
      }
      return;
    }

    // 10. Update customer message
    await sleep(500);
    await updateInteractionResponse(
      interaction.application_id,
      interaction.token,
      "Got it! Your request has been added to our queue. We'll send you a message when it's ready!",
      [
        {
          title: 'Original Request',
          color: 3447003, // Blue
          description: sanitizedInput.substring(0, 2000), // Discord embed limit
        },
      ]
    );

    // 11. Follow-up unmatched cards (ephemeral)
    const unmatchedCards = cardsWithData.filter(
      (card) => card.set === 'no match'
    );

    if (unmatchedCards.length > 0) {
      await sleep(1000);
      const unmatchedList = unmatchedCards
        .map((card) => `- ${card.name}`)
        .join('\n');

      await followUpMessage(
        interaction.application_id,
        interaction.token,
        "Heads up! I didn't recognize the following as Magic cards. **No action needed on your end!** The staff know more about cards than me, and will reach out if they need you to clarify.",
        [
          {
            title: 'Unmatched Cards',
            color: 3447003, // Blue
            description: unmatchedList.substring(0, 2000), // Discord embed limit
          },
        ],
        64 // Ephemeral flag
      );
    }
  } catch (error) {
    console.error('Unexpected error in processRequestList:', error);
    // Try to notify user of error
    try {
      await updateInteractionResponse(
        interaction.application_id,
        interaction.token,
        'An unexpected error occurred while processing your request. Please try again or contact support.',
        [
          {
            title: 'Error',
            description: 'The request could not be processed.',
            color: 15158332, // Red
          },
        ]
      );
    } catch (updateError) {
      console.error('Failed to send error message:', updateError);
    }
  }
}

