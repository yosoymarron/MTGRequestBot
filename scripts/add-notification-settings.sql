-- Add notification settings columns to mtgrequestbot_settings table
-- Run this script to add the new notification configuration fields

ALTER TABLE mtgrequestbot_settings
ADD COLUMN IF NOT EXISTS daily_reminder_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS aging_alert_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS aging_alert_days INTEGER DEFAULT 5;

-- Add comments for documentation
COMMENT ON COLUMN mtgrequestbot_settings.daily_reminder_enabled IS 'Whether daily reminder messages are enabled for this guild';
COMMENT ON COLUMN mtgrequestbot_settings.aging_alert_enabled IS 'Whether aging request alerts are enabled for this guild';
COMMENT ON COLUMN mtgrequestbot_settings.aging_alert_days IS 'Number of business days before a pending request triggers an aging alert';

