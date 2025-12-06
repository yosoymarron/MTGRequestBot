import { CardDataWithScryfall, CardData } from '../types/database';

interface ScryfallCard {
  object: string;
  name: string;
  set: string;
  legalities?: {
    standard?: string;
  };
  prices?: {
    usd?: string;
  };
  cmc?: number;
  colors?: string[];
  type_line?: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchCardData(
  cardName: string
): Promise<Partial<CardDataWithScryfall> | null> {
  try {
    const url = new URL('https://api.scryfall.com/cards/named');
    url.searchParams.set('fuzzy', cardName);
    url.searchParams.set('q', 'game:paper');
    url.searchParams.set('order', 'released');
    url.searchParams.set('dir', 'desc');

    const response = await fetch(url.toString());

    if (!response.ok) {
      if (response.status === 404) {
        return null; // Card not found
      }
      throw new Error(`Scryfall API error: ${response.status}`);
    }

    const cardData = await response.json();
    const card = cardData as ScryfallCard;

    if (card.object !== 'card') {
      return null;
    }

    // Extract primary type (before em dash)
    let primaryType = '';
    if (card.type_line) {
      const typeParts = card.type_line.split('—');
      primaryType = typeParts[0].trim();
    }

    // Check if over $5
    const usdPrice = card.prices?.usd ? parseFloat(card.prices.usd) : 0;
    const isOverFiveDollars = usdPrice > 5 ? '✅' : '';

    // Check standard legality
    const isStandardLegal = card.legalities?.standard === 'legal' ? '✅' : '';

    // Format colors
    const colors = card.colors && Array.isArray(card.colors) ? card.colors.join('') : '';

    return {
      set: card.set || 'no match',
      legalities_standard: isStandardLegal,
      is_over_5_dollars: isOverFiveDollars,
      cmc: card.cmc ?? '',
      colors: colors,
      primary_type: primaryType,
    };
  } catch (error) {
    console.error(`Error fetching card data for ${cardName}:`, error);
    return null;
  }
}

export async function fetchAllCardData(
  cards: CardData[]
): Promise<CardDataWithScryfall[]> {
  const results: CardDataWithScryfall[] = [];

  for (const card of cards) {
    const scryfallData = await fetchCardData(card.name);

    const cardWithData: CardDataWithScryfall = {
      ...card,
      set: scryfallData?.set || 'no match',
      legalities_standard: scryfallData?.legalities_standard || '',
      is_over_5_dollars: scryfallData?.is_over_5_dollars || '',
      cmc: scryfallData?.cmc || '',
      colors: scryfallData?.colors || '',
      primary_type: scryfallData?.primary_type || '',
    };

    results.push(cardWithData);

    // 100ms delay between calls
    await sleep(100);
  }

  // Sort alphabetically by name
  results.sort((a, b) => {
    const nameA = a.name.toUpperCase();
    const nameB = b.name.toUpperCase();
    if (nameA < nameB) return -1;
    if (nameA > nameB) return 1;
    return 0;
  });

  return results;
}

