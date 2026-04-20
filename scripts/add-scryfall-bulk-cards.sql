-- Scryfall bulk card cache (local lookup instead of /cards/named per request)
-- Run after base schema. Requires pg_trgm for fuzzy name matching.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS mtgrequestbot_scryfall_cards (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    lang TEXT NOT NULL,
    released_at DATE,
    set_code TEXT NOT NULL,
    games JSONB NOT NULL,
    legalities JSONB NOT NULL,
    price_usd NUMERIC(10, 2),
    cmc DOUBLE PRECISION,
    colors TEXT[] NOT NULL DEFAULT '{}',
    type_line TEXT
);

CREATE INDEX IF NOT EXISTS idx_scryfall_cards_name_trgm
    ON mtgrequestbot_scryfall_cards USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_scryfall_cards_lang_released
    ON mtgrequestbot_scryfall_cards (lang, released_at DESC NULLS LAST);

COMMENT ON TABLE mtgrequestbot_scryfall_cards IS 'Subset of Scryfall default_cards bulk (English, paper) for local lookup';

-- Staging table: same shape, no trigram index (faster bulk load)
CREATE TABLE IF NOT EXISTS mtgrequestbot_scryfall_cards_staging (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    lang TEXT NOT NULL,
    released_at DATE,
    set_code TEXT NOT NULL,
    games JSONB NOT NULL,
    legalities JSONB NOT NULL,
    price_usd NUMERIC(10, 2),
    cmc DOUBLE PRECISION,
    colors TEXT[] NOT NULL DEFAULT '{}',
    type_line TEXT
);
