import { ButtonInteraction, InteractionResponseType, ButtonStyle } from '../../types/discord';
import { getRequest } from '../../services/database';
import { updateDiscordMessage } from '../../services/discord';

export async function handleTogglePrint(
  interaction: ButtonInteraction,
  requestId: number,
  isPrinting: boolean
): Promise<any> {
  // Defer response immediately
  const deferredResponse = {
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  };

  // Process in background
  processTogglePrint(interaction, requestId, isPrinting).catch((error) => {
    console.error('Error processing print toggle:', error);
  });

  return deferredResponse;
}

async function processTogglePrint(
  interaction: ButtonInteraction,
  requestId: number,
  isPrinting: boolean
): Promise<void> {
  // Fetch request to get ID for button custom_id
  const request = await getRequest(requestId);
  if (!request) {
    console.error(`Request ${requestId} not found`);
    return;
  }

  // Update button state
  if (isPrinting) {
    // Mark as printed
    await updateDiscordMessage(
      interaction.channel_id,
      interaction.message.id,
      undefined,
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
              label: 'Printed ✅',
              custom_id: `unprint-request_${requestId}`,
            },
          ],
        },
      ]
    );
  } else {
    // Mark as not printed
    await updateDiscordMessage(
      interaction.channel_id,
      interaction.message.id,
      undefined,
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
      ]
    );
  }
}

