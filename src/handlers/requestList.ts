import {
  CommandInteraction,
  InteractionResponseType,
  ButtonStyle,
} from '../types/discord';
import { getGuildSettings, createRequest } from '../services/database';
import { parseCardRequest } from '../services/openai';
import { fetchAllCardData } from '../services/scryfall';
import { sanitizeInput } from '../utils/sanitize';
import { preMatchCardNames } from '../utils/preParser';
import { generatePDF, generatePDFFilename } from '../utils/pdfGenerator';
import {
  sendDiscordMessage,
  updateInteractionResponse,
  followUpMessage,
} from '../services/discord';
import { CardDataWithScryfall } from '../types/database';
import { buildConfirmationMessage } from '../utils/confirmationMessage';
import { formatCardsForModal } from '../utils/cardFormatter';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function handleRequestList(
  interaction: CommandInteraction
): Promise<any> {
  // 1. Immediate response (within 3 seconds)
  const immediateResponse = {
    type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      flags: 64, // Ephemeral
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

    // 5. Pre-match card names against DB to give LLM confirmed hints
    let preMatchedNames: string[] = [];
    try {
      const preMatched = await preMatchCardNames(sanitizedInput);
      preMatchedNames = [...preMatched];
    } catch (error) {
      console.error('Pre-match error (non-fatal):', error);
    }

    // 6. Parse with OpenAI (pre-matched names passed as hints)
    let parsedCards;
    try {
      parsedCards = await parseCardRequest(sanitizedInput, preMatchedNames);
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

    // 7. Fetch card data from Scryfall — includes recovery pass and A-Z sort
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

    // 8. Save to database as draft (Confirming) — store sorted, enriched card data
    const cardsRequested = { user_note: parsedCards.user_note, card_data: cardsWithData };
    const requestId = await createRequest(
      guildId,
      interaction.token,
      interaction.data.id,
      interaction.channel_id,
      interaction.member?.user.id || interaction.user?.id || '',
      interaction,
      cardsRequested,
      'Confirming'
    );

    // 9. Present confirmation to the user
    // Use formatted modal text length (not raw input) to guard the Edit button
    const modalText = formatCardsForModal(cardsRequested);
    const { content, embeds, components } = buildConfirmationMessage(
      requestId,
      cardsWithData,
      modalText.length
    );

    await updateInteractionResponse(
      interaction.application_id,
      interaction.token,
      content,
      embeds,
      components
    );
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

