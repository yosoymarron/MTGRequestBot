import { ButtonStyle } from '../types/discord';
import { CardDataWithScryfall } from '../types/database';

const DISCORD_EMBED_DESC_LIMIT = 4096;
const DISCORD_MODAL_TEXT_LIMIT = 4000;

/**
 * Build the confirmation embed and button components for a draft request.
 * Re-used after initial parsing and after each modal edit.
 */
export function buildConfirmationMessage(
  requestId: number,
  cardsWithData: CardDataWithScryfall[],
  originalInputLength: number
) {
  // Build card list lines
  const lines: string[] = [];
  const unmatchedCards: string[] = [];

  for (const card of cardsWithData) {
    const foilTag = card.foil === 'Only'
      ? ' · *Foil Only*'
      : card.foil === 'Preferred'
        ? ' · *Foil Preferred*'
        : '';
    const setTag = card.set && card.set !== 'no match'
      ? ` · ${card.set.toUpperCase()}`
      : '';
    const noMatchTag = card.set === 'no match'
      ? ' · ⚠️ *no match*'
      : '';
    const specificPrint = card.specific_print
      ? ` *(${card.specific_print})*`
      : '';

    lines.push(`**${card.qty}×** ${card.name}${foilTag}${specificPrint}${setTag}${noMatchTag}`);

    if (card.set === 'no match') {
      unmatchedCards.push(card.name);
    }
  }

  // Build description
  let description = lines.join('\n');

  // Add unmatched cards warning
  if (unmatchedCards.length > 0) {
    description += `\n\n> ⚠️ **${unmatchedCards.length}** card${unmatchedCards.length === 1 ? '' : 's'} could not be identified but will still be included. Staff will reach out if they need clarification.`;
  }

  // Add large-list warning if applicable
  const isEditDisabled = originalInputLength > DISCORD_MODAL_TEXT_LIMIT;
  if (isEditDisabled) {
    description += '\n\n> ⚠️ Your card list is too large (over 4,000 characters) to support inline editing. If you need to make changes, please click **Cancel** and resubmit your list in smaller sections.';
  }

  // Truncate description if it exceeds Discord embed limit
  if (description.length > DISCORD_EMBED_DESC_LIMIT) {
    description = description.substring(0, DISCORD_EMBED_DESC_LIMIT - 50) + '\n\n*...list truncated for display*';
  }

  const embeds = [
    {
      title: '📋 Please review your parsed card list',
      description,
      color: 3447003, // Blue
      footer: { text: '⏱️ Please confirm within 15 minutes.' },
    },
  ];

  const components = [
    {
      type: 1, // ACTION_ROW
      components: [
        {
          type: 2, // BUTTON
          style: ButtonStyle.SUCCESS,
          label: 'Accept Request',
          custom_id: `confirm-accept-request_${requestId}`,
        },
        {
          type: 2,
          style: ButtonStyle.PRIMARY,
          label: 'Edit Details',
          custom_id: `confirm-edit-request_${requestId}`,
          disabled: isEditDisabled,
        },
        {
          type: 2,
          style: ButtonStyle.DANGER,
          label: 'Cancel',
          custom_id: `confirm-cancel-request_${requestId}`,
        },
      ],
    },
  ];

  return {
    content: "MTGRequestBot here! I've parsed your card request. Please review the details below before submitting.",
    embeds,
    components,
  };
}
