import { ButtonInteraction, InteractionResponseType } from '../../types/discord';
import { updateRequestStatus } from '../../services/database';
import { updateInteractionResponse } from '../../services/discord';

export async function handleConfirmCancel(
  interaction: ButtonInteraction,
  requestId: number
): Promise<any> {
  // Defer response immediately
  const deferredResponse = {
    type: InteractionResponseType.DEFERRED_UPDATE_MESSAGE,
  };

  processConfirmCancel(interaction, requestId).catch((error) => {
    console.error('Error processing confirm cancel:', error);
  });

  return deferredResponse;
}

async function processConfirmCancel(
  interaction: ButtonInteraction,
  requestId: number
): Promise<void> {
  // Update DB to Cancelled status
  await updateRequestStatus(requestId, 'Cancelled');

  // Update user ephemeral message to confirm cancellation
  await updateInteractionResponse(
    interaction.application_id,
    interaction.token,
    "❌ **Request Cancelled.** The request was not sent to staff.",
    [], // Remove embeds
    []  // Remove components
  );
}
