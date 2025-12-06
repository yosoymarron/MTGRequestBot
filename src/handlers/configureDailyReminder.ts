import { CommandInteraction, InteractionResponseType } from '../types/discord';
import { upsertGuildSettings } from '../services/database';

export async function handleConfigureDailyReminder(
  interaction: CommandInteraction
): Promise<any> {
  const guildId = interaction.guild_id;
  if (!guildId) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'This command can only be used in a server.',
        flags: 64, // Ephemeral
      },
    };
  }

  const enabledValue = interaction.data.options?.[0]?.value;
  if (enabledValue === undefined) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Please specify whether to enable or disable daily reminders.',
        flags: 64, // Ephemeral
      },
    };
  }

  // Convert value to boolean (handles string, number, or boolean)
  let enabled: boolean;
  if (typeof enabledValue === 'boolean') {
    enabled = enabledValue;
  } else if (typeof enabledValue === 'string') {
    enabled = enabledValue.toLowerCase() === 'true';
  } else if (typeof enabledValue === 'number') {
    enabled = enabledValue !== 0;
  } else {
    enabled = false;
  }

  await upsertGuildSettings(guildId, { dailyReminderEnabled: enabled });

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `Daily reminder messages have been ${enabled ? 'enabled' : 'disabled'} for this server.`,
    },
  };
}

