import { CardDataWithScryfall, CardData } from '../types/database';
import { pool } from './database';

const FUZZY_SIMILARITY_THRESHOLD = 0.30;
const LOOKUP_CONCURRENCY = 6;

interface ScryfallDbRow {
  set_code: string;
  legalities: { standard?: string };
  price_usd: string | number | null;
  cmc: string | number | null;
  colors: string[] | null;
  type_line: string | null;
  rarity: string | null;
}

const SCRYFALL_COLUMNS =
  'set_code, legalities, price_usd, cmc, colors, type_line, rarity';

/**
 * Picks which printing a card's meta comes from — every printed field (cost,
 * colors, rarity, type, price, LPS) is read off this one row so they always
 * describe the same physical card.
 *
 * Ranking:
 *  1. Normal printings before promos / Secret Lair / masterpieces / Un-sets.
 *     Rarity is per-printing, so a promo variant can disagree with the set
 *     printing (Sol Ring in `soc` is uncommon normally, mythic as a promo).
 *  2. Then most recently released.
 *  3. Then booster printings before same-set showcase variants, which are not
 *     promos but still differ in rarity (Foundations Llanowar Elves is common
 *     at #227 and mythic as the #429 showcase).
 *  4. Then set_code/id purely so remaining ties are deterministic rather than
 *     whatever order Postgres happens to return.
 *
 * COALESCE keeps this sane before the first bulk sync backfills the new
 * columns: NULL set_type/promo rank as "normal" instead of poisoning the sort.
 */
const PRINTING_RANK = `(
    COALESCE(promo, false)
    OR COALESCE(set_type, '') IN ('promo', 'box', 'memorabilia', 'funny', 'token', 'minigame', 'masterpiece')
  ) ASC,
  released_at DESC NULLS LAST,
  COALESCE(booster, false) DESC,
  set_code ASC,
  id ASC`;

/** Only printings that have actually been released — a store can't stock a future set. */
const RELEASED_FILTER = '(released_at IS NULL OR released_at <= CURRENT_DATE)';

const RARITY_LETTERS: Record<string, string> = {
  common: 'C',
  uncommon: 'U',
  rare: 'R',
  mythic: 'M',
  special: 'S',
  bonus: 'S',
};

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

  // Single-letter shorthand for the printout; unknown values fall back to the
  // raw first letter so a new Scryfall rarity never prints as blank.
  const rarityRaw = row.rarity?.toLowerCase() ?? '';
  const rarity =
    RARITY_LETTERS[rarityRaw] ?? (rarityRaw ? rarityRaw[0].toUpperCase() : '');

  return {
    set: row.set_code || 'no match',
    legalities_standard: isStandardLegal,
    is_over_5_dollars: isOverFiveDollars,
    cmc: Number.isNaN(cmc as number) ? '' : cmc,
    colors,
    primary_type: primaryType,
    rarity,
  };
}

async function lookupCardDataFromDb(
  cardName: string
): Promise<Partial<CardDataWithScryfall> | null> {
  const exact = await pool.query<ScryfallDbRow>(
    `SELECT ${SCRYFALL_COLUMNS}
     FROM mtgrequestbot_scryfall_cards
     WHERE lang = 'en'
       AND games @> '["paper"]'::jsonb
       AND lower(name) = lower($1)
       AND ${RELEASED_FILTER}
     ORDER BY ${PRINTING_RANK}
     LIMIT 1`,
    [cardName]
  );
  if (exact.rows.length > 0) {
    return rowToPartial(exact.rows[0]);
  }

  const fuzzy = await pool.query<ScryfallDbRow & { sim?: number }>(
    `SELECT ${SCRYFALL_COLUMNS},
            similarity(name, $1) AS sim
     FROM mtgrequestbot_scryfall_cards
     WHERE lang = 'en'
       AND games @> '["paper"]'::jsonb
       AND similarity(name, $1) > $2
       AND ${RELEASED_FILTER}
     ORDER BY similarity(name, $1) DESC, ${PRINTING_RANK}
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
      rarity: scryfallData?.rarity || '',
    };
  });

  // Recovery pass: for cards still unmatched that have a specific_print, try
  // the combined "name, specific_print" as a single card name. Handles cases
  // like "Ral Zarek, Guest Lecturer" where the LLM split the comma-name.
  const recovered = await mapWithConcurrency(
    results,
    LOOKUP_CONCURRENCY,
    async (card) => {
      if (card.set !== 'no match' || !card.specific_print) return card;
      const combined = `${card.name}, ${card.specific_print}`;
      const match = await lookupCardDataFromDb(combined);
      if (!match) return card;
      return {
        ...card,
        ...match,
        name: combined,
        specific_print: null,
      };
    }
  );

  recovered.sort((a, b) => {
    const nameA = a.name.toUpperCase();
    const nameB = b.name.toUpperCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  return recovered;
}
