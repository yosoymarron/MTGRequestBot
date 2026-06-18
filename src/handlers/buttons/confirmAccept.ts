import { ButtonInteraction, InteractionResponseType, ButtonStyle } from '../../types/discord';
import { claimRequestForProcessing, getRequest, getGuildSettings } from '../../services/database';
import { sendDiscordMessage, updateInteractionResponse } from '../../services/discord';
import { generatePDF, generatePDFFilename } from '../../utils/pdfGenerator';
import { CardDataWithScryfall } from '../../types/database';

export async function handleConfirmAccept(
  interaction: ButtonInteraction,
  requestId: number
): Promise<any> {
  // Defer response immediately
  const deferredResponse = {
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  };

  processConfirmAccept(interaction, requestId).catch((error) => {
    console.error('Error processing confirm accept:', error);
  });

  return deferredResponse;
}

async function processConfirmAccept(
  interaction: ButtonInteraction,
  requestId: number
): Promise<void> {
  const guildId = interaction.guild_id;
  if (!guildId) return;

  const settings = await getGuildSettings(guildId);
  if (!settings || !settings.task_channel) {
    console.error('No task channel configured');
    return;
  }

  // Atomically claim the request — guards against duplicate Discord retries
  const claimed = await claimRequestForProcessing(requestId);
  if (!claimed) return;

  const request = await getRequest(requestId);
  if (!request) return;

  const parsedCards = request.cards_requested;
  const cardsWithData = parsedCards.card_data as CardDataWithScryfall[];
  
  let originalComment = '';
  const payload = request.request_payload as any;
  if (payload.originalInput) {
    originalComment = payload.originalInput;
  } else {
    // From initial slash command
    originalComment = payload.data?.options?.[0]?.value || '';
  }

  // Generate PDF
  const userId = interaction.member?.user.id || interaction.user?.id || '';
  const userNick = interaction.member?.nick || interaction.member?.user.global_name || interaction.member?.user.username || interaction.user?.username || 'Unknown';
  const username = interaction.member?.user.username || interaction.user?.username || 'Unknown';

  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await generatePDF({
      requestId,
      userNick,
      username,
      requestNote: parsedCards.user_note,
      cardData: cardsWithData,
      originalComment,
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    pdfBuffer = Buffer.from('');
  }

  const pdfFilename = generatePDFFilename(requestId, userNick);
  const pdfFile = pdfBuffer.length > 0 ? [{ name: pdfFilename, data: pdfBuffer }] : undefined;

  // Send to task channel
  await sendDiscordMessage(
    settings.task_channel,
    `A new card request has been submitted by <@${userId}>. ${pdfFile ? 'A downloadable PDF is attached for your review.' : 'PDF generation failed, but request was processed.'}`,
    [
      {
        title: pdfFile ? 'New Card Request - Attached' : 'New Card Request',
        description: pdfFile ? 'Please download the attached file to view the detailed request.' : 'PDF generation failed. Check logs for details.',
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

  // Post a public message in the request channel so the submission is visible
  // and referenceable by both the user and other staff
  if (settings.request_channel) {
    await sendDiscordMessage(
      settings.request_channel,
      `A new card request has been submitted by <@${userId}> (Request #${requestId}). Feel free to respond here with any updates or questions!`,
      [],
      []
    );
  }

  // Update user ephemeral message to confirm success
  await updateInteractionResponse(
    interaction.application_id,
    interaction.token,
    "✅ **Request Submitted!** Your MTG card request has been sent to our staff. We will notify you here when it is ready!\n\n*(A post has also been made in the request channel that you and others can respond to with updates or questions. This message can't be seen by others.)*",
    [], // Remove embeds
    []  // Remove components
  );
}
