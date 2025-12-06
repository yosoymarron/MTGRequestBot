import { CommandInteraction, InteractionResponseType } from '../types/discord';
import { upsertGuildSettings } from '../services/database';

export async function handleConfigureAgingAlerts(
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
  const days = interaction.data.options?.[1]?.value as number | undefined;

  if (enabledValue === undefined) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Please specify whether to enable or disable aging alerts.',
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

  const settings: { agingAlertEnabled: boolean; agingAlertDays?: number } = {
    agingAlertEnabled: enabled,
  };

  if (days !== undefined) {
    if (days < 1 || days > 30) {
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: 'Aging alert days must be between 1 and 30.',
          flags: 64, // Ephemeral
        },
      };
    }
    settings.agingAlertDays = days;
  }

  await upsertGuildSettings(guildId, settings);

  let responseMessage = `Aging alerts have been ${enabled ? 'enabled' : 'disabled'} for this server.`;
  if (days !== undefined) {
    responseMessage += ` Alert threshold set to ${days} business day${days === 1 ? '' : 's'}.`;
  }

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: responseMessage,
    },
  };
}

