import {
  Interaction,
  InteractionType,
  InteractionResponseType,
  PingInteraction,
  CommandInteraction,
  ButtonInteraction,
} from '../types/discord';
import { handlePing } from './ping';
import { handleSetRequestChannel } from './setRequestChannel';
import { handleSetTaskChannel } from './setTaskChannel';
import { handleRequestList } from './requestList';
import { handleButtonInteraction } from './buttons/buttonRouter';
import { handleConfigureDailyReminder } from './configureDailyReminder';
import { handleConfigureAgingAlerts } from './configureAgingAlerts';

export async function router(interaction: Interaction): Promise<any> {
  switch (interaction.type) {
    case InteractionType.PING:
      return handlePing(interaction as PingInteraction);

    case InteractionType.APPLICATION_COMMAND:
      return handleCommand(interaction as CommandInteraction);

    case InteractionType.MESSAGE_COMPONENT:
      return handleButtonInteraction(interaction as ButtonInteraction);

    default:
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: 'Unknown interaction type' },
      };
  }
}

async function handleCommand(interaction: CommandInteraction): Promise<any> {
  const commandName = interaction.data.name;

  switch (commandName) {
    case 'set-request-channel':
      return handleSetRequestChannel(interaction);

    case 'set-task-channel':
      return handleSetTaskChannel(interaction);

    case 'request-list':
      return handleRequestList(interaction);

    case 'configure-daily-reminder':
      return handleConfigureDailyReminder(interaction);

    case 'configure-aging-alerts':
      return handleConfigureAgingAlerts(interaction);

    default:
      return {
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: { content: `Unknown command: ${commandName}` },
      };
  }
}

