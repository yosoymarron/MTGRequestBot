export interface GuildSettings {
  guild_id: string;
  request_channel?: string;
  task_channel?: string;
  daily_reminder_enabled?: boolean;
  aging_alert_enabled?: boolean;
  aging_alert_days?: number;
  updated_at: Date;
}

export interface CardData {
  qty: number;
  name: string;
  foil: string; // "Only", "Preferred", or ""
  specific_print?: string | null;
}

export interface CardDataWithScryfall extends CardData {
  set: string;
  legalities_standard: string;
  is_over_5_dollars: string;
  cmc: string | number;
  colors: string;
  primary_type: string;
}

export interface ParsedCardRequest {
  user_note: string;
  card_data: CardData[];
}

export interface Request {
  id: number;
  guild_id: string;
  interaction_token: string;
  interaction_id: string;
  channel_id: string;
  user_id: string;
  status: string;
  request_payload: object;
  created_at: Date;
  updated_at: Date;
  cards_requested: {
    user_note: string;
    card_data: CardData[];
  };
}

