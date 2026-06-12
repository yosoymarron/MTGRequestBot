import { ButtonInteraction, InteractionResponseType } from '../../types/discord';
import { getRequest } from '../../services/database';

export async function handleConfirmEdit(
  interaction: ButtonInteraction,
  requestId: number
): Promise<any> {
  const request = await getRequest(requestId);
  if (!request) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: { content: 'Error: Request not found.', flags: 64 },
    };
  }

  // Retrieve original input to pre-populate the modal
  let originalComment = '';
  const payload = request.request_payload as any;
  if (payload.originalInput) {
    originalComment = payload.originalInput;
  } else {
    // From initial slash command
    originalComment = payload.data?.options?.[0]?.value || '';
  }

  // Prevent showing modal if the text is longer than Discord's 4000 char limit for text inputs
  if (originalComment.length > 4000) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Your card list is too large (over 4000 characters) to be edited here. Please cancel this request and submit a new one with fewer cards.',
        flags: 64
      }
    };
  }

  return {
    type: InteractionResponseType.MODAL, // 9
    data: {
      title: 'Edit Card List',
      custom_id: `confirm-modal-submit_${requestId}`,
      components: [
        {
          type: 1, // ACTION_ROW
          components: [
            {
              type: 4, // TEXT_INPUT
              custom_id: 'card_list_input',
              label: 'Your Card List (no staff notes)',
              style: 2, // PARAGRAPH
              min_length: 1,
              max_length: 4000,
              value: originalComment, // Pre-populate
              required: true,
            },
          ],
        },
      ],
    },
  };
}
