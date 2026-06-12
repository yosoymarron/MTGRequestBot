export enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  MODAL_SUBMIT = 5,
}

export enum InteractionResponseType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
  DEFERRED_UPDATE_MESSAGE = 6,
  UPDATE_MESSAGE = 7,
  MODAL = 9,
}

export enum ButtonStyle {
  PRIMARY = 1,
  SECONDARY = 2,
  SUCCESS = 3,
  DANGER = 4,
  LINK = 5,
}

export interface PingInteraction {
  type: InteractionType.PING;
}

export interface CommandInteraction {
  type: InteractionType.APPLICATION_COMMAND;
  data: {
    id: string;
    name: string;
    options?: Array<{
      name: string;
      value: string | number;
    }>;
  };
  guild_id?: string;
  channel_id: string;
  member?: {
    user: {
      id: string;
      username: string;
      global_name?: string;
    };
    nick?: string;
  };
  user?: {
    id: string;
    username: string;
    global_name?: string;
  };
  token: string;
  application_id: string;
}

export interface ButtonInteraction {
  type: InteractionType.MESSAGE_COMPONENT;
  data: {
    custom_id: string;
  };
  guild_id?: string;
  channel_id: string;
  member?: {
    user: {
      id: string;
      username: string;
      global_name?: string;
    };
    nick?: string;
  };
  user?: {
    id: string;
    username: string;
    global_name?: string;
  };
  message: {
    id: string;
  };
  token: string;
  application_id: string;
}

export interface ModalSubmitInteraction {
  type: InteractionType.MODAL_SUBMIT;
  data: {
    custom_id: string;
    components: Array<{
      type: number;
      components: Array<{
        type: number;
        custom_id: string;
        value: string;
      }>;
    }>;
  };
  guild_id?: string;
  channel_id: string;
  member?: {
    user: {
      id: string;
      username: string;
      global_name?: string;
    };
    nick?: string;
  };
  user?: {
    id: string;
    username: string;
    global_name?: string;
  };
  token: string;
  application_id: string;
}

export type Interaction = PingInteraction | CommandInteraction | ButtonInteraction | ModalSubmitInteraction;

export interface InteractionResponse {
  type: InteractionResponseType;
  data?: {
    content?: string;
    embeds?: Array<{
      title?: string;
      description?: string;
      color?: number;
    }>;
    components?: Array<{
      type: number;
      components: Array<{
        type: number;
        style?: number;
        label: string;
        custom_id?: string;
        disabled?: boolean;
      }>;
    }>;
    flags?: number;
  };
}

