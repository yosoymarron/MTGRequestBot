import { PingInteraction } from '../types/discord';
import { InteractionResponseType } from '../types/discord';

export async function handlePing(interaction: PingInteraction): Promise<any> {
  return {
    type: InteractionResponseType.PONG,
  };
}

