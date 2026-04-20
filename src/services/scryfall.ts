import { CardDataWithScryfall, CardData } from '../types/database';
import { pool } from './database';

const FUZZY_SIMILARITY_THRESHOLD = 0.35;
const LOOKUP_CONCURRENCY = 6;

interface ScryfallDbRow {
  set_code: string;
  legalities: { standard?: string };
  price_usd: string | number | null;
  cmc: string | number | null;
  colors: string[] | null;
  type_line: string | null;
}

function rowToPartial(row: ScryfallDbRow): Partial<CardDataWithScryfall> {
  let primaryType = '';
  if (row.type_line) {
    const typeParts = row.type_line.split('—');
    primaryType = typeParts[0].trim();
  }

  const usd =
    row.price_usd === null || row.price_usd === undefined
      ? 0
      : typeof row.price_usd === 'string'
        ? parseFloat(row.price_usd)
        : row.price_usd;
  const isOverFiveDollars =
    !Number.isNaN(usd) && usd > 5 ? '✅' : '';

  const isStandardLegal =
    row.legalities?.standard === 'legal' ? '✅' : '';

  const colors =
    row.colors && Array.isArray(row.colors) ? row.colors.join('') : '';

  const cmcVal = row.cmc;
  const cmc =
    cmcVal === null || cmcVal === undefined
      ? ''
      : typeof cmcVal === 'string'
        ? parseFloat(cmcVal)
        : cmcVal;

  return {
    set: row.set_code || 'no match',
    legalities_standard: isStandardLegal,
    is_over_5_dollars: isOverFiveDollars,
    cmc: Number.isNaN(cmc as number) ? '' : cmc,
    colors,
    primary_type: primaryType,
  };
}

async function lookupCardDataFromDb(
  cardName: string
): Promise<Partial<CardDataWithScryfall> | null> {
  const exact = await pool.query<ScryfallDbRow>(
    `SELECT set_code, legalities, price_usd, cmc, colors, type_line
     FROM mtgrequestbot_scryfall_cards
     WHERE lang = 'en'
       AND games @> '["paper"]'::jsonb
       AND lower(name) = lower($1)
     ORDER BY released_at DESC NULLS LAST
     LIMIT 1`,
    [cardName]
  );
  if (exact.rows.length > 0) {
    return rowToPartial(exact.rows[0]);
  }

  const fuzzy = await pool.query<ScryfallDbRow & { sim?: number }>(
    `SELECT set_code, legalities, price_usd, cmc, colors, type_line,
            similarity(name, $1) AS sim
     FROM mtgrequestbot_scryfall_cards
     WHERE lang = 'en'
       AND games @> '["paper"]'::jsonb
       AND similarity(name, $1) > $2
     ORDER BY similarity(name, $1) DESC, released_at DESC NULLS LAST
     LIMIT 1`,
    [cardName, FUZZY_SIMILARITY_THRESHOLD]
  );
  if (fuzzy.rows.length === 0) {
    return null;
  }
  return rowToPartial(fuzzy.rows[0]);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function worker(): Promise<void> {
    while (true) {
      const idx = next++;
      if (idx >= items.length) return;
      results[idx] = await fn(items[idx]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  );
  return results;
}

export async function fetchCardData(
  cardName: string
): Promise<Partial<CardDataWithScryfall> | null> {
  try {
    return await lookupCardDataFromDb(cardName);
  } catch (error) {
    console.error(`Error looking up card data for ${cardName}:`, error);
    return null;
  }
}

export async function fetchAllCardData(
  cards: CardData[]
): Promise<CardDataWithScryfall[]> {
  const scryfallParts = await mapWithConcurrency(
    cards,
    LOOKUP_CONCURRENCY,
    (card) => lookupCardDataFromDb(card.name)
  );

  const results: CardDataWithScryfall[] = cards.map((card, i) => {
    const scryfallData = scryfallParts[i];
    return {
      ...card,
      set: scryfallData?.set || 'no match',
      legalities_standard: scryfallData?.legalities_standard || '',
      is_over_5_dollars: scryfallData?.is_over_5_dollars || '',
      cmc: scryfallData?.cmc ?? '',
      colors: scryfallData?.colors || '',
      primary_type: scryfallData?.primary_type || '',
    };
  });

  results.sort((a, b) => {
    const nameA = a.name.toUpperCase();
    const nameB = b.name.toUpperCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  return results;
}
