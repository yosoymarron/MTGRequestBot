import { ButtonInteraction, InteractionResponseType } from '../../types/discord';
import { handleCompleteRequest } from './completeRequest';
import { handleCancelRequest } from './cancelRequest';
import { handleTogglePrint } from './togglePrint';
import { handleConfirmAccept } from './confirmAccept';
import { handleConfirmCancel } from './confirmCancel';
import { handleConfirmEdit } from './confirmEdit';

export async function handleButtonInteraction(
  interaction: ButtonInteraction
): Promise<any> {
  const customId = interaction.data.custom_id;
  // Format: "complete-request_123" or "print-request_123"
  const lastUnderscoreIndex = customId.lastIndexOf('_');
  if (lastUnderscoreIndex === -1) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'Invalid button custom_id format' },
    };
  }

  const action = customId.substring(0, lastUnderscoreIndex);
  const requestId = parseInt(customId.substring(lastUnderscoreIndex + 1), 10);

  if (isNaN(requestId)) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'Invalid request ID in button' },
    };
  }

  switch (action) {
    case 'complete-request':
      return handleCompleteRequest(interaction, requestId);

    case 'cancel-request':
      return handleCancelRequest(interaction, requestId);

    case 'print-request':
      return handleTogglePrint(interaction, requestId, true);

    case 'unprint-request':
      return handleTogglePrint(interaction, requestId, false);

    case 'confirm-accept-request':
      return handleConfirmAccept(interaction, requestId);

    case 'confirm-cancel-request':
      return handleConfirmCancel(interaction, requestId);

    case 'confirm-edit-request':
      return handleConfirmEdit(interaction, requestId);

    default:
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Unknown button action' },
      };
  }
}

