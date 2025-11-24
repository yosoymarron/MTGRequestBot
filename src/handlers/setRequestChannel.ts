import { CommandInteraction, InteractionResponseType } from '../types/discord';
import { upsertGuildSettings } from '../services/database';

export async function handleSetRequestChannel(
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

  const channelId = interaction.data.options?.[0]?.value as string;
  if (!channelId) {
    return {
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Please provide a channel.',
        flags: 64, // Ephemeral
      },
    };
  }

  await upsertGuildSettings(guildId, { requestChannel: channelId });

  return {
    type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
    data: {
      content: `Got it! New Request Channel set to: <#${channelId}>`,
    },
  };
}

