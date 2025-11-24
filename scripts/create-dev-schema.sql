-- MTG Request Bot - Development Database Schema
-- This script creates the necessary tables for the development database
-- Run this script after creating your dev database to set up the schema

-- Table: mtgrequestbot_settings
-- Stores guild-specific bot configuration (channels, etc.)
CREATE TABLE IF NOT EXISTS mtgrequestbot_settings (
    guild_id VARCHAR(255) PRIMARY KEY,
    request_channel VARCHAR(255),
    task_channel VARCHAR(255),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Table: mtgrequestbot_requests
-- Stores card requests submitted by users
CREATE TABLE IF NOT EXISTS mtgrequestbot_requests (
    id SERIAL PRIMARY KEY,
    guild_id VARCHAR(255) NOT NULL,
    interaction_token VARCHAR(255) NOT NULL,
    interaction_id VARCHAR(255) NOT NULL,
    channel_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'Pending',
    request_payload JSONB NOT NULL,
    cards_requested JSONB NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_requests_guild_id ON mtgrequestbot_requests(guild_id);
CREATE INDEX IF NOT EXISTS idx_requests_status ON mtgrequestbot_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_user_id ON mtgrequestbot_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON mtgrequestbot_requests(created_at);

-- Add comments for documentation
COMMENT ON TABLE mtgrequestbot_settings IS 'Stores Discord guild-specific bot configuration';
COMMENT ON TABLE mtgrequestbot_requests IS 'Stores card requests submitted through Discord interactions';
COMMENT ON COLUMN mtgrequestbot_settings.guild_id IS 'Discord guild (server) ID';
COMMENT ON COLUMN mtgrequestbot_settings.request_channel IS 'Channel ID where users submit requests';
COMMENT ON COLUMN mtgrequestbot_settings.task_channel IS 'Channel ID where staff see requests';
COMMENT ON COLUMN mtgrequestbot_requests.status IS 'Request status: Pending, Completed, Cancelled, etc.';
COMMENT ON COLUMN mtgrequestbot_requests.request_payload IS 'Full Discord interaction payload as JSON';
COMMENT ON COLUMN mtgrequestbot_requests.cards_requested IS 'Parsed card request data as JSON';

