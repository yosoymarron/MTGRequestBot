import { pool } from '../services/database';

function stripQty(line: string): string {
  return line
    .replace(/^\s*\d+\s*x\s+/i, '')  // "2x ", "15x "
    .replace(/^\s*x\s*\d+\s+/i, '')  // "x2 "
    .replace(/^\s*\d+\s+/, '')        // "2 " (bare number + space)
    .trim();
}

function stripFoilAnnotations(text: string): string {
  return text
    .replace(/\s*!foil\s*$/i, '')
    .replace(/\s*\[foil\]\s*$/i, '')
    .replace(/\s*\bfoil\s+only\s*$/i, '')
    .replace(/\s*\bfoil\s+preferred\s*$/i, '')
    .replace(/\s*\bfoil\s*$/i, '')
    .trim();
}

// Returns distinct candidate card names to try for a given line, ordered
// from most-specific (full cleaned text) to more trimmed variants.
function extractCandidates(line: string): string[] {
  const withoutQty = stripQty(line);
  const withoutFoil = stripFoilAnnotations(withoutQty);

  const candidates: string[] = [];

  // Full text after stripping qty — handles "Ral Zarek, Guest Lecturer" as-is
  if (withoutQty.length >= 2) candidates.push(withoutQty);

  // Same but with foil markers removed
  if (withoutFoil.length >= 2 && withoutFoil !== withoutQty) {
    candidates.push(withoutFoil);
  }

  // Text up to a parenthetical set code, e.g. "Lightning Bolt (MRD) 98" → "Lightning Bolt"
  const parenSetMatch = withoutFoil.match(/^(.+?)\s+\([A-Z0-9]{2,6}\)/);
  if (parenSetMatch && parenSetMatch[1].trim().length >= 2) {
    candidates.push(parenSetMatch[1].trim());
  }

  return [...new Set(candidates)].filter((c) => c.length >= 2);
}

async function exactCardMatch(name: string): Promise<string | null> {
  const result = await pool.query<{ name: string }>(
    `SELECT name FROM mtgrequestbot_scryfall_cards
     WHERE lang = 'en'
       AND games @> '["paper"]'::jsonb
       AND lower(name) = lower($1)
     LIMIT 1`,
    [name]
  );
  return result.rows[0]?.name ?? null;
}

/**
 * Scans raw user input line-by-line and tries to confirm card names directly
 * against the database before the LLM sees the input. Returns a Set of exact
 * card names (casing from the DB) that were found.
 *
 * These are passed as hints to parseCardRequest so the LLM treats them as
 * authoritative and won't split comma-containing names like
 * "Ral Zarek, Guest Lecturer".
 */
export async function preMatchCardNames(rawInput: string): Promise<Set<string>> {
  const confirmed = new Set<string>();
  const lines = rawInput.split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.length < 2) continue;

    const candidates = extractCandidates(trimmed);
    for (const candidate of candidates) {
      const match = await exactCardMatch(candidate);
      if (match) {
        confirmed.add(match);
        break; // first match wins for this line
      }
    }
  }

  return confirmed;
}
