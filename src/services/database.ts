import { Pool, QueryResult } from 'pg';
import { GuildSettings, Request, ParsedCardRequest } from '../types/database';

// Select database URL based on NODE_ENV
// - development: uses DATABASE_URL_DEV
// - production: uses DATABASE_URL_PROD
// - fallback: uses DATABASE_URL for backward compatibility
function getDatabaseUrl(): string {
  const nodeEnv = process.env.NODE_ENV || 'development';
  
  if (nodeEnv === 'production') {
    return process.env.DATABASE_URL_PROD || process.env.DATABASE_URL || '';
  } else {
    // development or any other environment
    return process.env.DATABASE_URL_DEV || process.env.DATABASE_URL || '';
  }
}

const databaseUrl = getDatabaseUrl();

if (!databaseUrl) {
  throw new Error(
    `Database URL not configured. Please set DATABASE_URL_DEV (for development) or DATABASE_URL_PROD (for production) in your .env file.`
  );
}

const pool = new Pool({
  connectionString: databaseUrl,
});

// Test database connection on startup
pool.on('error', (err: Error) => {
  console.error('Unexpected database pool error:', err);
});

// Validate database URL format
try {
  const url = new URL(databaseUrl);
  if (url.hostname === 'host') {
    console.warn('Warning: Database hostname is set to "host" which appears to be a placeholder. Please update your DATABASE_URL_DEV or DATABASE_URL_PROD environment variable with the actual database hostname (e.g., "localhost" or your database server IP/hostname).');
  }
} catch (err) {
  // URL parsing failed, but Pool will handle the connection error
  console.warn('Could not parse database URL for validation');
}

export async function getGuildSettings(
  guildId: string
): Promise<GuildSettings | null> {
  const result: QueryResult<GuildSettings> = await pool.query(
    'SELECT * FROM mtgrequestbot_settings WHERE guild_id = $1 LIMIT 1',
    [guildId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

export async function upsertGuildSettings(
  guildId: string,
  settings: {
    requestChannel?: string;
    taskChannel?: string;
    dailyReminderEnabled?: boolean;
    agingAlertEnabled?: boolean;
    agingAlertDays?: number;
  }
): Promise<void> {
  const { requestChannel, taskChannel, dailyReminderEnabled, agingAlertEnabled, agingAlertDays } = settings;

  if (requestChannel !== undefined) {
    await pool.query(
      `INSERT INTO mtgrequestbot_settings (guild_id, request_channel, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET request_channel = $2, updated_at = NOW()`,
      [guildId, requestChannel]
    );
  }

  if (taskChannel !== undefined) {
    await pool.query(
      `INSERT INTO mtgrequestbot_settings (guild_id, task_channel, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET task_channel = $2, updated_at = NOW()`,
      [guildId, taskChannel]
    );
  }

  if (dailyReminderEnabled !== undefined) {
    await pool.query(
      `INSERT INTO mtgrequestbot_settings (guild_id, daily_reminder_enabled, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET daily_reminder_enabled = $2, updated_at = NOW()`,
      [guildId, dailyReminderEnabled]
    );
  }

  if (agingAlertEnabled !== undefined) {
    await pool.query(
      `INSERT INTO mtgrequestbot_settings (guild_id, aging_alert_enabled, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET aging_alert_enabled = $2, updated_at = NOW()`,
      [guildId, agingAlertEnabled]
    );
  }

  if (agingAlertDays !== undefined) {
    await pool.query(
      `INSERT INTO mtgrequestbot_settings (guild_id, aging_alert_days, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (guild_id) 
       DO UPDATE SET aging_alert_days = $2, updated_at = NOW()`,
      [guildId, agingAlertDays]
    );
  }
}

export async function createRequest(
  guildId: string,
  interactionToken: string,
  interactionId: string,
  channelId: string,
  userId: string,
  requestPayload: object,
  cardsRequested: ParsedCardRequest
): Promise<number> {
  const result: QueryResult<{ id: number }> = await pool.query(
    `INSERT INTO mtgrequestbot_requests 
     (guild_id, interaction_token, interaction_id, channel_id, user_id, status, request_payload, created_at, updated_at, cards_requested)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8)
     RETURNING id`,
    [
      guildId,
      interactionToken,
      interactionId,
      channelId,
      userId,
      'Pending',
      JSON.stringify(requestPayload),
      JSON.stringify(cardsRequested),
    ]
  );

  return result.rows[0].id;
}

export async function updateRequestStatus(
  id: number,
  status: string
): Promise<void> {
  await pool.query(
    'UPDATE mtgrequestbot_requests SET status = $1, updated_at = NOW() WHERE id = $2',
    [status, id]
  );
}

export async function getRequest(id: number): Promise<Request | null> {
  const result: QueryResult<Request> = await pool.query(
    'SELECT * FROM mtgrequestbot_requests WHERE id = $1 LIMIT 1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

export async function getAllGuildSettings(): Promise<GuildSettings[]> {
  const result: QueryResult<GuildSettings> = await pool.query(
    'SELECT * FROM mtgrequestbot_settings'
  );

  return result.rows;
}

export async function getAgedPendingRequests(
  guildId: string,
  cutoffDate: string
): Promise<Request[]> {
  // cutoffDate is in format YYYY-MM-DD HH:MM:SS in UTC representing the end of the cutoff day
  // We want tasks created on or before this timestamp (tasks that are at least X business days old)
  // PostgreSQL will handle the timestamp comparison correctly
  const result: QueryResult<Request> = await pool.query(
    `SELECT id, interaction_id, guild_id, channel_id, user_id, status, created_at
     FROM mtgrequestbot_requests 
     WHERE status = 'Pending' 
       AND created_at <= $1::timestamp
       AND guild_id = $2
     ORDER BY created_at ASC`,
    [cutoffDate, guildId]
  );

  return result.rows;
}

// Close pool on process exit
process.on('SIGINT', async () => {
  await pool.end();
});

process.on('SIGTERM', async () => {
  await pool.end();
});

