import { ButtonInteraction, InteractionResponseType, ButtonStyle } from '../../types/discord';
import { updateRequestStatus, getRequest } from '../../services/database';
import { sendDiscordMessage, updateDiscordMessage } from '../../services/discord';

export async function handleCompleteRequest(
  interaction: ButtonInteraction,
  requestId: number
): Promise<any> {
  // Defer response immediately
  const deferredResponse = {
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  };

  // Process in background
  processCompleteRequest(interaction, requestId).catch((error) => {
    console.error('Error processing complete request:', error);
  });

  return deferredResponse;
}

async function processCompleteRequest(
  interaction: ButtonInteraction,
  requestId: number
): Promise<void> {
  // Update database
  await updateRequestStatus(requestId, 'Completed');

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
    `<@${userId}> Your request has been completed. Keep an eye out for a message from our staff!`
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
            style: ButtonStyle.SUCCESS,
            label: 'Completed!',
            custom_id: 'completed',
            disabled: true,
          },
        ],
      },
    ]
  );
}

