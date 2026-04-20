import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable, Writable } from 'stream';
import zlib from 'zlib';
import chain from 'stream-chain';
import * as streamJson from 'stream-json';
import type { Pool } from 'pg';

const parser = streamJson.parser;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const streamArray = require('stream-json/streamers/stream-array.js');

const BULK_DATA_URL = 'https://api.scryfall.com/bulk-data';
const BATCH_SIZE = 2500;
const FILE_PREFIX = 'default-cards-';
const FILE_SUFFIX = '.json.gz';
const KEEP_DOWNLOADS = 3;

export interface ScryfallBulkRow {
  id: string;
  name: string;
  lang: string;
  released_at: string | null;
  set_code: string;
  games: object;
  legalities: object;
  price_usd: number | null;
  cmc: number | null;
  colors: string[];
  type_line: string | null;
}

export function getScryfallBulkDir(): string {
  return (
    process.env.SCRYFALL_BULK_DIR ||
    path.join(process.cwd(), 'data', 'scryfall-bulk')
  );
}

function mapCardToRow(card: unknown): ScryfallBulkRow | null {
  if (!card || typeof card !== 'object') return null;
  const c = card as Record<string, unknown>;
  if (c.object !== 'card') return null;
  if (c.lang !== 'en') return null;
  const games = c.games;
  if (!Array.isArray(games) || !games.includes('paper')) return null;

  const id = c.id;
  if (typeof id !== 'string') return null;
  const name = c.name;
  if (typeof name !== 'string') return null;
  const set = c.set;
  if (typeof set !== 'string') return null;

  let released_at: string | null = null;
  if (typeof c.released_at === 'string' && c.released_at.length >= 10) {
    released_at = c.released_at.slice(0, 10);
  }

  const legalities = c.legalities;
  if (!legalities || typeof legalities !== 'object') return null;

  let price_usd: number | null = null;
  const prices = c.prices;
  if (prices && typeof prices === 'object') {
    const usd = (prices as Record<string, unknown>).usd;
    if (typeof usd === 'string' && usd.length > 0) {
      const n = parseFloat(usd);
      if (!Number.isNaN(n)) price_usd = n;
    }
  }

  let cmc: number | null = null;
  if (typeof c.cmc === 'number' && !Number.isNaN(c.cmc)) cmc = c.cmc;

  const colors: string[] = Array.isArray(c.colors)
    ? c.colors.filter((x): x is string => typeof x === 'string')
    : [];

  const type_line =
    typeof c.type_line === 'string' ? c.type_line : null;

  return {
    id,
    name,
    lang: 'en',
    released_at,
    set_code: set,
    games: games as object,
    legalities: legalities as object,
    price_usd,
    cmc,
    colors,
    type_line,
  };
}

async function insertBatch(pool: Pool, rows: ScryfallBulkRow[]): Promise<void> {
  if (rows.length === 0) return;
  const cols = 11;
  const placeholders = rows
    .map((_, rowIdx) => {
      const base = rowIdx * cols;
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9}, $${base + 10}, $${base + 11})`;
    })
    .join(', ');
  const values = rows.flatMap((r) => [
    r.id,
    r.name,
    r.lang,
    r.released_at,
    r.set_code,
    r.games,
    r.legalities,
    r.price_usd,
    r.cmc,
    r.colors,
    r.type_line,
  ]);
  await pool.query(
    `INSERT INTO mtgrequestbot_scryfall_cards_staging (id, name, lang, released_at, set_code, games, legalities, price_usd, cmc, colors, type_line) VALUES ${placeholders}`,
    values
  );
}

class StagingInsertWriter extends Writable {
  private batch: ScryfallBulkRow[] = [];

  constructor(private readonly pool: Pool) {
    super({ objectMode: true });
  }

  override _write(
    chunk: { key: number; value: unknown },
    _enc: BufferEncoding,
    cb: (error?: Error | null) => void
  ): void {
    void (async () => {
      try {
        const row = mapCardToRow(chunk.value);
        if (row) this.batch.push(row);
        if (this.batch.length >= BATCH_SIZE) {
          const toInsert = this.batch.splice(0, BATCH_SIZE);
          await insertBatch(this.pool, toInsert);
        }
        cb();
      } catch (e) {
        cb(e as Error);
      }
    })();
  }

  override _final(cb: (error?: Error | null) => void): void {
    void (async () => {
      try {
        await insertBatch(this.pool, this.batch);
        this.batch = [];
        cb();
      } catch (e) {
        cb(e as Error);
      }
    })();
  }
}

async function truncateStaging(pool: Pool): Promise<void> {
  await pool.query('TRUNCATE mtgrequestbot_scryfall_cards_staging');
}

async function swapStagingToMain(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE mtgrequestbot_scryfall_cards');
    await client.query(
      `INSERT INTO mtgrequestbot_scryfall_cards
       SELECT * FROM mtgrequestbot_scryfall_cards_staging`
    );
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

async function ingestFileToStaging(
  pool: Pool,
  filePath: string
): Promise<void> {
  await truncateStaging(pool);
  const writer = new StagingInsertWriter(pool);
  const jsonPipeline = chain([
    fsSync.createReadStream(filePath),
    zlib.createGunzip(),
    parser(),
    streamArray(),
  ]);
  await pipeline(jsonPipeline, writer);
}

async function downloadDefaultCardsToFile(
  downloadUri: string,
  destPath: string
): Promise<void> {
  const res = await fetch(downloadUri, {
    headers: { 'User-Agent': 'MTGRequestBot/1.0 (bulk sync)' },
  });
  if (!res.ok) {
    throw new Error(`Bulk download failed: ${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    throw new Error('Bulk download: empty response body');
  }
  const nodeReadable = Readable.fromWeb(res.body as import('stream/web').ReadableStream);
  await pipeline(nodeReadable, fsSync.createWriteStream(destPath));
}

async function fetchDefaultCardsDownloadUri(): Promise<string> {
  const res = await fetch(BULK_DATA_URL, {
    headers: { 'User-Agent': 'MTGRequestBot/1.0 (bulk sync)' },
  });
  if (!res.ok) {
    throw new Error(`Bulk manifest failed: ${res.status} ${res.statusText}`);
  }
  const manifest = (await res.json()) as {
    data?: Array<{ type?: string; download_uri?: string }>;
  };
  const entry = manifest.data?.find((d) => d.type === 'default_cards');
  if (!entry?.download_uri) {
    throw new Error('Bulk manifest: default_cards entry not found');
  }
  return entry.download_uri;
}

function timestampForFilename(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export async function pruneOldBulkFiles(bulkDir: string): Promise<void> {
  let entries: string[];
  try {
    entries = await fs.readdir(bulkDir);
  } catch {
    return;
  }
  const matches = entries.filter(
    (f) => f.startsWith(FILE_PREFIX) && f.endsWith(FILE_SUFFIX)
  );
  const withMtime = await Promise.all(
    matches.map(async (name) => {
      const full = path.join(bulkDir, name);
      const stat = await fs.stat(full);
      return { full, mtime: stat.mtimeMs };
    })
  );
  withMtime.sort((a, b) => b.mtime - a.mtime);
  const toRemove = withMtime.slice(KEEP_DOWNLOADS);
  for (const { full } of toRemove) {
    try {
      await fs.unlink(full);
    } catch {
      /* ignore */
    }
  }
}

/**
 * Download Scryfall default_cards bulk gzip, load into DB (staging swap), keep last 3 files on disk.
 */
export async function runScryfallBulkSync(pool: Pool): Promise<void> {
  const bulkDir = getScryfallBulkDir();
  await fs.mkdir(bulkDir, { recursive: true });

  const downloadUri = await fetchDefaultCardsDownloadUri();
  const destName = `${FILE_PREFIX}${timestampForFilename()}${FILE_SUFFIX}`;
  const destPath = path.join(bulkDir, destName);

  await downloadDefaultCardsToFile(downloadUri, destPath);
  await ingestFileToStaging(pool, destPath);
  await swapStagingToMain(pool);
  await pruneOldBulkFiles(bulkDir);
}
