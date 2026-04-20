import * as cron from 'node-cron';
import {
  getAllGuildSettings,
  getAgedPendingRequests,
  pool,
} from './database';
import { runScryfallBulkSync } from './scryfallBulkSync';
import { sendDiscordMessage, getChannelMessages } from './discord';
import { DAILY_REMINDER_MESSAGES } from '../config/messages';

const DISCORD_MESSAGE_MAX_LENGTH = 2000;

/**
 * Calculate the cutoff date for aging alerts
 * Returns the end of the day that is X business days ago.
 * Tasks created on or before this date/time are considered "aged" (at least X business days old).
 * @param days Number of business days to go back
 * @returns ISO timestamp string (YYYY-MM-DD HH:MM:SS) in UTC representing the end of the cutoff day
 */
function subtractBusinessDays(days: number): string {
  // Use UTC to avoid timezone issues
  const now = new Date();
  const date = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 0, 0, 0
  )); // Start of today in UTC
  let remainingDays = days;

  while (remainingDays > 0) {
    date.setUTCDate(date.getUTCDate() - 1);
    const weekday = date.getUTCDay(); // 0 (Sunday) to 6 (Saturday)

    // Check if it's a weekday (Monday=1 to Friday=5)
    if (weekday >= 1 && weekday <= 5) {
      remainingDays--;
    }
  }

  // Set to end of the cutoff day (23:59:59) in UTC to include all tasks created on that day
  date.setUTCHours(23, 59, 59, 999);

  // Format as ISO timestamp string in UTC
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  const seconds = String(date.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Send daily reminder messages to enabled guilds
 * @param guildId Optional guild ID to filter to a specific guild. If not provided, defaults to '754831938035908638'. Pass null to process all enabled guilds.
 */
export async function sendDailyReminders(guildId?: string | null): Promise<void> {
  try {
    const allSettings = await getAllGuildSettings();

    // Filter for guilds with daily reminders enabled and a valid request channel
    let enabledGuilds = allSettings.filter(
      (settings) =>
        settings.daily_reminder_enabled === true &&
        settings.request_channel
    );

    // If guildId is provided (not null), filter to that specific guild
    // If null, process all enabled guilds (for scheduled tasks)
    // If undefined, default to specific guild (for API endpoints)
    if (guildId === null) {
      // Process all enabled guilds (scheduled task)
    } else {
      const targetGuildId = guildId || '754831938035908638';
      enabledGuilds = enabledGuilds.filter(
        (settings) => settings.guild_id === targetGuildId
      );
    }

    if (enabledGuilds.length === 0) {
      console.log('[Scheduler] No guilds with daily reminders enabled');
      return;
    }

    // Select a random message
    const randomMessage =
      DAILY_REMINDER_MESSAGES[
        Math.floor(Math.random() * DAILY_REMINDER_MESSAGES.length)
      ];

    // Send to all enabled guilds
    const promises = enabledGuilds.map(async (settings) => {
      try {
        await sendDiscordMessage(
          settings.request_channel!,
          randomMessage
        );
        console.log(
          `[Scheduler] Sent daily reminder to guild ${settings.guild_id}`
        );
      } catch (error: any) {
        console.error(
          `[Scheduler] Failed to send daily reminder to guild ${settings.guild_id}:`,
          error.message
        );
      }
    });

    await Promise.all(promises);
    console.log(`[Scheduler] Daily reminders sent to ${enabledGuilds.length} guild(s)`);
  } catch (error: any) {
    console.error('[Scheduler] Error sending daily reminders:', error);
  }
}

/**
 * Fetch message IDs from Discord task channel by matching request IDs
 * @param taskChannelId Task channel ID
 * @param requestIds Array of request IDs to find
 * @returns Map of request ID to message ID
 */
async function fetchMessageIdsForRequests(
  taskChannelId: string,
  requestIds: number[]
): Promise<Map<number, string>> {
  const messageIdMap = new Map<number, string>();

  try {
    // Fetch recent messages from the task channel
    const messages = await getChannelMessages(taskChannelId, 100);

    // Create a set for faster lookup
    const requestIdSet = new Set(requestIds);

    // Search through messages for buttons with matching request IDs
    for (const message of messages) {
      if (message.components && Array.isArray(message.components)) {
        for (const componentRow of message.components) {
          if (componentRow.components && Array.isArray(componentRow.components)) {
            for (const component of componentRow.components) {
              if (component.custom_id && component.custom_id.startsWith('complete-request_')) {
                const requestId = parseInt(component.custom_id.split('_')[1], 10);
                if (requestIdSet.has(requestId) && !messageIdMap.has(requestId)) {
                  messageIdMap.set(requestId, message.id);
                }
              }
            }
          }
        }
      }
    }
  } catch (error: any) {
    console.error(`[Scheduler] Error fetching messages from task channel ${taskChannelId}:`, error.message);
  }

  return messageIdMap;
}

/**
 * Format a list of aged requests into Discord message format
 * Only includes requests that have a corresponding Discord message (with complete-request button)
 * @param requests Array of aged requests
 * @param guildId Guild ID for constructing message links
 * @param taskChannelId Task channel ID for fetching message IDs
 * @returns Array of formatted message strings (only for requests with Discord messages)
 */
async function formatAgedRequests(
  requests: Array<{
    id: number;
    user_id: string;
    channel_id: string;
  }>,
  guildId: string,
  taskChannelId: string
): Promise<string[]> {
  const BASE_URL = 'https://discord.com/channels/';
  const formattedTasks: string[] = [];
  const droppedRequests: Array<{ id: number; user_id: string }> = [];

  // Fetch message IDs for all requests
  const requestIds = requests.map((r) => r.id);
  const messageIdMap = await fetchMessageIdsForRequests(taskChannelId, requestIds);

  for (const request of requests) {
    // Try to get message ID from the map
    const messageId = messageIdMap.get(request.id);
    
    if (messageId) {
      // Only include requests that have a corresponding Discord message
      const messageURL = `${BASE_URL}${guildId}/${taskChannelId}/${messageId}`;
      const taskString = `<@${request.user_id}>: [Click here to jump to task](${messageURL})`;
      formattedTasks.push(taskString);
    } else {
      // Log dropped requests that don't have a Discord message
      droppedRequests.push({ id: request.id, user_id: request.user_id });
    }
  }

  // Log dropped requests if any
  if (droppedRequests.length > 0) {
    console.log(
      `[Scheduler] Dropped ${droppedRequests.length} aged request(s) without Discord messages:`,
      droppedRequests.map((r) => `ID ${r.id} (user ${r.user_id})`).join(', ')
    );
  }

  return formattedTasks;
}

/**
 * Split a long message into chunks that fit within Discord's 2000 character limit
 * @param header Header text for each message
 * @param items Array of items to include
 * @returns Array of message strings
 */
function splitMessage(
  header: string,
  items: string[]
): string[] {
  const messages: string[] = [];
  let currentMessage = header + '\n\n';
  const itemSeparator = '\n\n';

  for (const item of items) {
    const testMessage = currentMessage + item + itemSeparator;

    if (testMessage.length > DISCORD_MESSAGE_MAX_LENGTH) {
      // Current message is full, save it and start a new one
      if (currentMessage.trim() !== header.trim()) {
        messages.push(currentMessage.trim());
      }
      currentMessage = header + '\n\n' + item + itemSeparator;
    } else {
      currentMessage = testMessage;
    }
  }

  // Add the last message if it has content
  if (currentMessage.trim() !== header.trim()) {
    messages.push(currentMessage.trim());
  }

  return messages;
}

/**
 * Send aging notifications to enabled guilds
 * @param guildId Optional guild ID to filter to a specific guild. If not provided, defaults to '754831938035908638'. Pass null to process all enabled guilds.
 */
export async function sendAgingNotifications(guildId?: string | null): Promise<void> {
  try {
    const allSettings = await getAllGuildSettings();

    // Filter for guilds with aging alerts enabled and a valid task channel
    let enabledGuilds = allSettings.filter(
      (settings) =>
        settings.aging_alert_enabled === true &&
        settings.task_channel
    );

    // If guildId is provided (not null), filter to that specific guild
    // If null, process all enabled guilds (for scheduled tasks)
    // If undefined, default to specific guild (for API endpoints)
    if (guildId === null) {
      // Process all enabled guilds (scheduled task)
    } else {
      const targetGuildId = guildId || '754831938035908638';
      enabledGuilds = enabledGuilds.filter(
        (settings) => settings.guild_id === targetGuildId
      );
    }

    if (enabledGuilds.length === 0) {
      console.log('[Scheduler] No guilds with aging alerts enabled');
      return;
    }

    // Process each enabled guild
    for (const settings of enabledGuilds) {
      try {
        const days = settings.aging_alert_days || 5;
        const cutoffDate = subtractBusinessDays(days);
        
        console.log(`[Scheduler] Processing aging alerts for guild ${settings.guild_id}: threshold=${days} days, cutoff=${cutoffDate}`);

        // Fetch aged pending requests
        const agedRequests = await getAgedPendingRequests(
          settings.guild_id,
          cutoffDate
        );
        
        if (agedRequests.length > 0) {
          console.log(`[Scheduler] Found ${agedRequests.length} aged requests. Sample created_at: ${agedRequests[0].created_at}`);
        }

        if (agedRequests.length === 0) {
          console.log(
            `[Scheduler] No aged requests found for guild ${settings.guild_id}`
          );
          continue;
        }

        // Format requests with message IDs from Discord
        // Note: formatAgedRequests will filter out requests without Discord messages
        const formattedTasks = await formatAgedRequests(
          agedRequests.map((r) => ({
            id: r.id,
            user_id: r.user_id,
            channel_id: r.channel_id,
          })),
          settings.guild_id,
          settings.task_channel!
        );

        // Only send notifications if there are tasks with Discord messages
        if (formattedTasks.length === 0) {
          console.log(
            `[Scheduler] No aged requests with Discord messages found for guild ${settings.guild_id} (${agedRequests.length} total aged requests in DB)`
          );
          continue;
        }

        const header = `**📢 Heads up! These users have requests older than ${days} business day${days === 1 ? '' : 's'}**`;

        // Split into multiple messages if needed
        const messages = splitMessage(header, formattedTasks);

        // Send all messages
        for (const message of messages) {
          await sendDiscordMessage(settings.task_channel!, message);
        }

        console.log(
          `[Scheduler] Sent aging notification for ${formattedTasks.length} request(s) to guild ${settings.guild_id} (${agedRequests.length} total aged requests in DB)`
        );
      } catch (error: any) {
        console.error(
          `[Scheduler] Failed to send aging notification to guild ${settings.guild_id}:`,
          error.message
        );
      }
    }
  } catch (error: any) {
    console.error('[Scheduler] Error sending aging notifications:', error);
  }
}

/**
 * Download and import Scryfall default_cards bulk data (scheduled daily).
 */
export async function runScryfallBulkSyncJob(): Promise<void> {
  try {
    console.log('[Scheduler] Starting Scryfall bulk sync');
    await runScryfallBulkSync(pool);
    console.log('[Scheduler] Scryfall bulk sync completed');
  } catch (error: any) {
    console.error('[Scheduler] Scryfall bulk sync failed:', error?.message || error);
    throw error;
  }
}

/**
 * Main scheduled task that runs daily at 10:00 AM EST (15:00 UTC)
 */
async function runDailyTasks(): Promise<void> {
  console.log('[Scheduler] Running daily tasks at 10:00 AM EST (15:00 UTC)');
  
  // Run both tasks in parallel
  // Pass null to process all enabled guilds (not just the default)
  await Promise.all([
    sendDailyReminders(null),
    sendAgingNotifications(null),
  ]);

  console.log('[Scheduler] Daily tasks completed');
}

/**
 * Initialize and start the scheduler
 */
export function initializeScheduler(): void {
  // Schedule daily task at 10:00 AM EST (15:00 UTC)
  // Cron format: minute hour day month weekday
  // '0 15 * * *' = 15:00 UTC (10:00 AM EST) every day
  cron.schedule('0 15 * * *', () => {
    runDailyTasks().catch((error) => {
      console.error('[Scheduler] Unhandled error in scheduled task:', error);
    });
  });

  const bulkCron =
    process.env.SCRYFALL_BULK_CRON && process.env.SCRYFALL_BULK_CRON.trim() !== ''
      ? process.env.SCRYFALL_BULK_CRON
      : '0 4 * * *';

  cron.schedule(bulkCron, () => {
    runScryfallBulkSyncJob().catch((error) => {
      console.error('[Scheduler] Unhandled error in Scryfall bulk sync:', error);
    });
  });

  console.log(
    `[Scheduler] Initialized - Daily tasks at 10:00 AM EST (15:00 UTC); Scryfall bulk sync at cron "${bulkCron}"`
  );
}

