import { ButtonInteraction, InteractionResponseType } from '../../types/discord';
import { getRequest } from '../../services/database';
import { formatCardsForModal } from '../../utils/cardFormatter';

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

  // Pre-populate with the bot's parsed interpretation so the user can correct
  // any mis-parses rather than editing raw input
  const formattedText = formatCardsForModal(request.cards_requested);

  // Prevent showing modal if the formatted text exceeds Discord's 4000 char limit
  if (formattedText.length > 4000) {
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
              label: 'Your Card List',
              style: 2, // PARAGRAPH
              min_length: 1,
              max_length: 4000,
              value: formattedText,
              required: true,
            },
          ],
        },
      ],
    },
  };
}
