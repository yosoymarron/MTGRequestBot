import { discordRequest } from './discord';

const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

if (!APPLICATION_ID) {
  throw new Error('DISCORD_APPLICATION_ID environment variable is required');
}

// Command definitions matching the n8n workflow
const COMMAND_DEFINITIONS = [
  {
    name: 'set-request-channel',
    type: 1, // CHAT_INPUT
    description: 'Sets the channel for user requests.',
    options: [
      {
        name: 'channel',
        description: 'The channel where users can submit requests.',
        type: 7, // CHANNEL
        required: true,
      },
    ],
    default_member_permissions: '4', // MANAGE_CHANNELS
  },
  {
    name: 'set-task-channel',
    type: 1, // CHAT_INPUT
    description: 'Sets the channel for task notifications.',
    options: [
      {
        name: 'channel',
        description: 'The channel where tasks will be posted',
        type: 7, // CHANNEL
        required: true,
      },
    ],
    default_member_permissions: '4', // MANAGE_CHANNELS
  },
  {
    name: 'request-list',
    type: 1, // CHAT_INPUT
    description: 'Request a list of cards for the store. Accepts a variety of formats.',
    options: [
      {
        type: 3, // STRING
        name: 'list',
        description: 'The card list you want to request.',
        required: true,
        nsfw: false,
      },
    ],
  },
];

export interface CommandRegistrationResult {
  guildId: string;
  registered: string[];
  skipped: string[];
  errors: Array<{ command: string; error: string }>;
}

/**
 * Fetches all guilds the bot is in
 */
export async function getAllGuilds(): Promise<string[]> {
  try {
    const guilds = await discordRequest('/users/@me/guilds');
    return guilds.map((guild: any) => guild.id);
  } catch (error) {
    throw new Error(`Failed to fetch guilds: ${error}`);
  }
}

/**
 * Registers commands for a specific guild
 * Checks existing commands first to ensure idempotency
 */
export async function registerCommandsForGuild(
  guildId: string
): Promise<CommandRegistrationResult> {
  const result: CommandRegistrationResult = {
    guildId,
    registered: [],
    skipped: [],
    errors: [],
  };

  try {
    // Fetch existing commands for this guild
    const existingCommands = await discordRequest(
      `/applications/${APPLICATION_ID}/guilds/${guildId}/commands`
    );

    // Extract existing command names
    const existingCommandNames = existingCommands.map(
      (cmd: any) => cmd.name
    );

    // Register each command if it doesn't exist
    for (const commandDef of COMMAND_DEFINITIONS) {
      try {
        if (existingCommandNames.includes(commandDef.name)) {
          result.skipped.push(commandDef.name);
          continue;
        }

        // Register the command
        await discordRequest(
          `/applications/${APPLICATION_ID}/guilds/${guildId}/commands`,
          {
            method: 'POST',
            body: JSON.stringify(commandDef),
          }
        );

        result.registered.push(commandDef.name);
      } catch (error: any) {
        result.errors.push({
          command: commandDef.name,
          error: error.message || String(error),
        });
      }
    }

    return result;
  } catch (error: any) {
    throw new Error(
      `Failed to register commands for guild ${guildId}: ${error.message || String(error)}`
    );
  }
}

