import 'dotenv/config';
import { pool } from '../services/database';
import { runScryfallBulkSync } from '../services/scryfallBulkSync';

runScryfallBulkSync(pool)
  .then(() => {
    console.log('Scryfall bulk sync finished successfully.');
  })
  .catch((error) => {
    console.error('Scryfall bulk sync failed:', error);
    process.exitCode = 1;
  })
  .finally(() => {
    void pool.end().then(() => process.exit(process.exitCode ?? 0));
  });
