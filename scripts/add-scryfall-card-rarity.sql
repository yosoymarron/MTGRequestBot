-- Add rarity (plus the fields needed to pick the right printing) to the
-- Scryfall card cache. Run after scripts/add-scryfall-bulk-cards.sql.
--
-- Rarity is per-printing, so choosing WHICH printing a card's meta comes from
-- now matters. `promo` and `set_type` let the lookup rank normal expansion
-- printings above promos and Secret Lair drops.
--
-- IMPORTANT: swapStagingToMain() runs `INSERT INTO main SELECT * FROM staging`,
-- which matches columns BY POSITION. Both tables must gain these columns in
-- the same order, so keep the two ALTER statements below in sync.

ALTER TABLE mtgrequestbot_scryfall_cards
ADD COLUMN IF NOT EXISTS rarity TEXT,
ADD COLUMN IF NOT EXISTS promo BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS set_type TEXT,
ADD COLUMN IF NOT EXISTS booster BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE mtgrequestbot_scryfall_cards_staging
ADD COLUMN IF NOT EXISTS rarity TEXT,
ADD COLUMN IF NOT EXISTS promo BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS set_type TEXT,
ADD COLUMN IF NOT EXISTS booster BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN mtgrequestbot_scryfall_cards.rarity IS 'Scryfall rarity of this printing: common, uncommon, rare, mythic, special, bonus';
COMMENT ON COLUMN mtgrequestbot_scryfall_cards.promo IS 'True if this printing is a promo; de-prioritized when resolving the last printed set';
COMMENT ON COLUMN mtgrequestbot_scryfall_cards.set_type IS 'Scryfall set_type (expansion, core, box, promo, ...); box/memorabilia/funny/masterpiece are de-prioritized';
COMMENT ON COLUMN mtgrequestbot_scryfall_cards.booster IS 'True if found in booster packs; breaks ties between a base printing and same-set showcase variants, which can differ in rarity';

-- These columns stay NULL/false until the next bulk sync repopulates the cache.
-- Run `npm run scryfall:bulk-sync` after applying this migration.
