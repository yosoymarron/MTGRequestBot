import { ParsedCardRequest, CardData } from '../types/database';

/**
 * Formats a parsed card request into structured, editable text for the
 * Discord modal. Shows the bot's interpretation of the request so the user
 * can correct any mis-parses before submitting.
 *
 * Format:
 *   Note: <user_note>
 *
 *   2x Lightning Bolt | Foil Only | Alpha printing
 *   1x Opt | Foil Preferred
 *   15x Duress
 */
export function formatCardsForModal(parsedRequest: ParsedCardRequest): string {
  const lines: string[] = [];

  if (parsedRequest.user_note?.trim()) {
    lines.push(`Note: ${parsedRequest.user_note.trim()}`);
    lines.push('');
  }

  for (const card of parsedRequest.card_data) {
    lines.push(formatCardLine(card));
  }

  return lines.join('\n');
}

function formatCardLine(card: CardData): string {
  let line = `${card.qty}x ${card.name}`;

  if (card.foil === 'Only') {
    line += ' | Foil Only';
  } else if (card.foil === 'Preferred') {
    line += ' | Foil Preferred';
  }

  if (card.specific_print) {
    line += ` | ${card.specific_print}`;
  }

  return line;
}
