import { ButtonInteraction, InteractionResponseType, ButtonStyle } from '../../types/discord';
import { updateRequestStatus, getRequest } from '../../services/database';
import { sendDiscordMessage, updateDiscordMessage } from '../../services/discord';

export async function handleCancelRequest(
  interaction: ButtonInteraction,
  requestId: number
): Promise<any> {
  // Defer response immediately
  const deferredResponse = {
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  };

  // Process in background
  processCancelRequest(interaction, requestId).catch((error) => {
    console.error('Error processing cancel request:', error);
  });

  return deferredResponse;
}

async function processCancelRequest(
  interaction: ButtonInteraction,
  requestId: number
): Promise<void> {
  // Update database
  await updateRequestStatus(requestId, 'Cancelled');

  // Fetch request data
  const request = await getRequest(requestId);
  if (!request) {
    console.error(`Request ${requestId} not found`);
    return;
  }

  // Send message to user
  const userId = request.user_id;
  await sendDiscordMessage(
    request.channel_id,
    `<@${userId}> Your request has been cancelled. Please reach out to a member of our staff with any questions!`
  );

  // Update task message buttons
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
            style: ButtonStyle.DANGER,
            label: 'Cancelled',
            custom_id: 'cancelled',
            disabled: true,
          },
        ],
      },
    ]
  );
}

