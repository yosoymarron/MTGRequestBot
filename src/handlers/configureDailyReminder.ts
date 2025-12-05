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

  const enabled = interaction.data.options?.[0]?.value as boolean;
  if (enabled === undefined) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Please specify whether to enable or disable daily reminders.',
        flags: 64, // Ephemeral
      },
    };
  }

  await upsertGuildSettings(guildId, { dailyReminderEnabled: enabled });

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `Daily reminder messages have been ${enabled ? 'enabled' : 'disabled'} for this server.`,
    },
  };
}

