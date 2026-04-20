# MTG Request Bot

Discord bot for processing Magic: The Gathering card requests, migrated from n8n to Node.js/TypeScript.

## Features

- `/request-list` - Submit card requests with automatic parsing and PDF generation
- `/set-request-channel` - Configure the channel where requests are accepted
- `/set-task-channel` - Configure the channel where staff see requests
- `/configure-daily-reminder` - Enable/disable daily reminder messages in request channels
- `/configure-aging-alerts` - Configure aging request alerts for staff notifications
- Button interactions for completing, cancelling, and tracking print status
- Automated daily notifications (reminders and aging alerts) scheduled for 10:00 AM EST (15:00 UTC)
- Local Scryfall card cache (daily bulk download/import) so `/request-list` does not call the Scryfall API for every card

## Prerequisites

- Node.js 20+ and npm
- PostgreSQL database (existing schema)
- Discord Application (test and production)
- OpenAI API key
- Cloudflare Tunnel (for webhook endpoint)

## Setup

### 1. Database Setup

The application uses separate databases for development and production to prevent accidental changes to production data.

#### Create Development Database

1. Connect to your PostgreSQL server:
   ```bash
   psql -U your_username -h your_host
   ```
   Or if using a connection string:
   ```bash
   psql postgresql://user:pass@host:5432/postgres
   ```

2. Create a new database for development:
   ```sql
   CREATE DATABASE mtgrequestbot_dev;
   ```

3. Connect to the new database:
   ```sql
   \c mtgrequestbot_dev
   ```

4. Run the schema creation script:
   ```bash
   psql -U your_username -h your_host -d mtgrequestbot_dev -f scripts/create-dev-schema.sql
   ```
   Or if already connected:
   ```sql
   \i scripts/create-dev-schema.sql
   ```

5. Run the notification settings migration (adds notification configuration columns):
   ```bash
   psql -U your_username -h your_host -d mtgrequestbot_dev -f scripts/add-notification-settings.sql
   ```
   Or if already connected:
   ```sql
   \i scripts/add-notification-settings.sql
   ```

6. Run the Scryfall bulk cards migration (adds `pg_trgm` and tables used for local card lookup):
   ```bash
   psql -U your_username -h your_host -d mtgrequestbot_dev -f scripts/add-scryfall-bulk-cards.sql
   ```
   Or if already connected:
   ```sql
   \i scripts/add-scryfall-bulk-cards.sql
   ```

#### Scryfall bulk data

Card metadata for PDFs is loaded from a local copy of Scryfall’s **default_cards** bulk file (English, paper-print rows only), not from `api.scryfall.com` per request.

- **Initial load:** After building (`npm run build`), run `npm run scryfall:bulk-sync`. This downloads the gzip from Scryfall, imports it into `mtgrequestbot_scryfall_cards`, and keeps up to **three** timestamped `.json.gz` files under `data/scryfall-bulk/` (configurable `SCRYFALL_BULK_DIR`).
- **Schedule:** The server runs a daily job (default **04:00 UTC**; override with `SCRYFALL_BULK_CRON`) to refresh the cache.
- **Disk:** Each download is on the order of tens to low hundreds of MB compressed; only three files are retained on disk.
- **Database:** Requires the `pg_trgm` extension (created by the migration). If the cache table is empty at startup, the server logs a warning until you run `scryfall:bulk-sync` or wait for the scheduled job.

For development without a prior `npm run build`, you can run the sync with `npx tsx src/cli/scryfallBulkSync.ts` (same env vars as the app).

#### Production Database

Your production database should already exist with the same schema. If you need to verify or recreate it, use the same `scripts/create-dev-schema.sql` script (the script uses `CREATE TABLE IF NOT EXISTS` so it's safe to run multiple times).

**After copying or restoring rows with existing ids** (for example importing from another database): PostgreSQL `SERIAL` sequences are not updated automatically. The next insert can try to reuse an id and fail with `duplicate key value violates unique constraint "mtgrequestbot_requests_pkey"`. Run:

```bash
psql "$DATABASE_URL_PROD" -f scripts/fix-sequences-after-data-copy.sql
```

(Adjust the connection string as needed—it must be the **same** DB the app uses.)

The script sets **every** `public` sequence whose name starts with `mtgrequestbot_requests` to `MAX(id)`, because restores sometimes attach the column default to a differently named sequence (for example `…_id_seq` vs `…_id_seq1`), while `pg_get_serial_sequence` alone can update the wrong one.

**If it still duplicates keys after running SQL by hand**, the app and DBeaver are often pointed at **different** databases (different host, port, or DB name). The server **syncs id sequences on startup** using the same pool as normal queries, and logs `currentDatabase` in a line like `Synced mtgrequestbot_requests id sequence(s) to MAX(id) for this connection`. Compare that database name in production logs to the database you select in DBeaver.

With Docker Compose, production uses `NODE_ENV=production` and therefore `DATABASE_URL_PROD` unless it is unset—then `DATABASE_URL` is used. Ensure the URL that resolves to `mtgrequestbot_prod` is the one in the container environment, not only in a local `.env` you use for DBeaver.

To inspect which sequence the `id` column uses:

```sql
SELECT pg_get_expr(d.adbin, d.adrelid) AS id_default
FROM pg_attrdef d
JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
JOIN pg_class c ON c.oid = a.attrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'mtgrequestbot_requests' AND a.attname = 'id';
```

**Note:** The application automatically selects the correct database based on `NODE_ENV`:
- `NODE_ENV=development` → uses `DATABASE_URL_DEV`
- `NODE_ENV=production` → uses `DATABASE_URL_PROD`

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

Create a `.env` file in the root directory. You can use `env.example` as a template:

```bash
# Copy the example file (on Windows, use: copy env.example .env)
cp env.example .env
```

Then edit `.env` and fill in your actual values:

```bash
# Discord (from test application)
DISCORD_PUBLIC_KEY=your_test_app_public_key
DISCORD_BOT_TOKEN=your_test_app_bot_token
DISCORD_APPLICATION_ID=your_test_app_id

# OpenAI
OPENAI_API_KEY=your_openai_key

# Database - Development (used when NODE_ENV=development)
DATABASE_URL_DEV=postgresql://user:pass@host:5432/mtgrequestbot_dev

# Database - Production (used when NODE_ENV=production)
DATABASE_URL_PROD=postgresql://user:pass@host:5432/mtgrequestbot_prod

# Fallback database URL (for backward compatibility)
# DATABASE_URL=postgresql://user:pass@host:5432/dbname

# Server
PORT=3001
NODE_ENV=development
```

**Important:** 
- When running locally for development, set `NODE_ENV=development` (or leave it unset, defaults to development)
- When deploying to production, set `NODE_ENV=production`
- The application will automatically use the correct database URL based on `NODE_ENV`

### 4. Discord Application Setup

1. Create a new Discord application at https://discord.com/developers/applications
2. Get your Application ID and Public Key from General Information
3. Create a bot in the Bot section and copy the token
4. Set Interactions Endpoint URL to: `https://your-cloudflare-tunnel-url/interactions`
5. Invite bot to your test server with appropriate permissions
6. Register slash commands using the admin endpoint (see step 5 below):
   - `/request-list` with a string option for card list
   - `/set-request-channel` with a channel option
   - `/set-task-channel` with a channel option

### 5. Development

Run the bot locally:

```bash
npm run dev
```

The server will start on port 3000 (or your configured PORT).

### 6. Register Commands

After starting the server, register Discord slash commands using the admin endpoint:

**Register commands for all guilds:**
```bash
curl -X POST http://localhost:3001/admin/register-commands
```

**Register commands for a specific guild:**
```bash
curl -X POST "http://localhost:3001/admin/register-commands?guildId=YOUR_GUILD_ID"
```

The endpoint returns a JSON response with registration results, including which commands were registered, skipped (already exist), or encountered errors. The registration is idempotent - running it multiple times won't create duplicate commands.

### 7. Configure Notifications

The bot includes an automated notification system that runs daily at 10:00 AM EST (15:00 UTC):

1. **Daily Reminders**: Sends rotating reminder messages to users in the request channel, reminding them to use `/request-list` for new card requests.

2. **Aging Alerts**: Sends notifications to staff in the task channel when requests have been pending for longer than the configured number of business days (default: 5 days).

#### Enable Notifications

Use Discord slash commands to configure notifications for your server:

**Enable daily reminders:**
```
/configure-daily-reminder enabled:true
```

**Enable aging alerts (with optional day threshold):**
```
/configure-aging-alerts enabled:true days:5
```

**Disable notifications:**
```
/configure-daily-reminder enabled:false
/configure-aging-alerts enabled:false
```

#### Manual Testing

You can manually trigger notifications using API endpoints for testing:

**Trigger daily reminders (defaults to guild 754831938035908638):**
```bash
curl -X POST http://localhost:3000/admin/trigger-daily-reminders
```

**Trigger for a specific guild:**
```bash
curl -X POST "http://localhost:3000/admin/trigger-daily-reminders?guildId=YOUR_GUILD_ID"
```

**Trigger aging alerts:**
```bash
curl -X POST http://localhost:3000/admin/trigger-aging-alerts
curl -X POST "http://localhost:3000/admin/trigger-aging-alerts?guildId=YOUR_GUILD_ID"
```

**Trigger all notifications:**
```bash

curl -X POST "http://localhost:3000/admin/trigger-all-notifications?guildId=YOUR_GUILD_ID"
```

**Note:** If no `guildId` query parameter is provided, the endpoints default to guild `754831938035908638`. The scheduled task (10:00 AM EST / 15:00 UTC) processes all enabled guilds automatically.

### 8. Build

Compile TypeScript:

```bash
npm run build
```

## Deployment

### Initial Setup on Raspberry Pi

#### 1. Set Up SSH Key for Git Authentication

Since the repository is private, you'll need to authenticate with Git using SSH keys.

**Generate SSH Key on Raspberry Pi:**

```bash
# SSH into your Raspberry Pi
ssh pi@your-pi-ip

# Generate a new SSH key
ssh-keygen -t ed25519 -C "pi-deployment"
# Press Enter to accept default location (~/.ssh/id_ed25519)
# Optionally set a passphrase (recommended for security, or press Enter for no passphrase)
Passphrase is: Color + Number
```

**Add SSH Key to Your Git Provider:**

1. Display your public key:
   ```bash
   cat ~/.ssh/id_ed25519.pub
   # Copy the entire output
   ```

2. Add the key to your Git provider:
   - **GitHub**: Settings → SSH and GPG keys → New SSH key → Paste and save
   - **GitLab**: Preferences → SSH Keys → Add key → Paste and save
   - **Bitbucket**: Personal Settings → SSH keys → Add key → Paste and save

**Test SSH Connection:**

```bash
# For GitHub
ssh -T git@github.com

# For GitLab
ssh -T git@gitlab.com
```

#### 2. Clone the Repository

```bash
# Navigate to where you want the project
cd ~/projects  # or wherever you prefer

# Clone using SSH URL (replace with your actual repository URL)
git clone git@github.com:yourusername/your-repo.git mtg-request-bot
cd mtg-request-bot
```

#### 3. Configure Environment Variables

```bash
# Create .env file from template
cp env.example .env

# Edit with production values
nano .env
```

**Important:** Set `NODE_ENV=production` in your `.env` file to use the production database.

#### 4. Initial Docker Build and Run

```bash
# Build the Docker image
docker-compose build

# Start the container
docker-compose up -d

# Monitor logs to verify it's running
docker logs -f mtg-request-bot
```

### Redeployment (Updating Code)

When you have updates or changes to your codebase:

#### Step 1: Pull Latest Code

```bash
# SSH into your Raspberry Pi
ssh pi@your-pi-ip

# Navigate to project directory
cd ~/mtg-request-bot  # or wherever you cloned it

# Pull the latest changes from Git
git pull origin main  # or 'master' depending on your default branch
```

#### Step 2: Rebuild and Restart Container

Since the Dockerfile builds TypeScript inside the container, you need to rebuild:

```bash
# Stop the current container
docker-compose down

# Rebuild the image (this will recompile TypeScript with your changes)
docker-compose build

# Start it back up
docker-compose up -d
```

**Or as a one-liner:**
```bash
docker-compose down && docker-compose build && docker-compose up -d
```

#### Step 3: Verify Deployment

```bash
# Check container status
docker ps

# View logs to ensure it started correctly
docker logs -f mtg-request-bot
```

#### Optional: Create a Deployment Script

For convenience, you can create a deployment script:

```bash
# Create deploy script
nano ~/mtg-request-bot/deploy.sh
```

Add this content:
```bash
#!/bin/bash
set -e  # Exit on error

cd ~/mtg-request-bot

echo "Pulling latest code..."
git pull origin main

echo "Rebuilding Docker image..."
docker-compose build

echo "Restarting container..."
docker-compose down
docker-compose up -d

echo "Checking logs..."
sleep 2
docker logs --tail 50 mtg-request-bot

echo "Deployment complete!"
```

Make it executable:
```bash
chmod +x ~/mtg-request-bot/deploy.sh
```

Then redeploy with:
```bash
~/mtg-request-bot/deploy.sh
```

### Important Notes

- **Environment Variables**: Your `.env` file is not copied into the Docker image. If you change `.env`, you only need to restart the container (no rebuild needed):
  ```bash
  docker-compose restart
  ```

- **Database Migrations**: If you have new database schema changes, run them separately:
  ```bash
  psql -U your_username -h your_host -d mtgrequestbot_prod -f scripts/new-migration.sql
  ```

- **Container Auto-Restart**: The container will automatically restart if it crashes (thanks to `restart: unless-stopped` in docker-compose.yml), but you still need to rebuild when code changes.

### Production Switchover

1. Test thoroughly with test Discord application
2. Once stable, update production Discord application's Interactions Endpoint URL
3. Verify production bot works correctly
4. Stop n8n workflow

## Project Structure

```
src/
  cli/              # One-off scripts (e.g. Scryfall bulk sync)
  config/           # Configuration files (reminder messages)
  handlers/         # Command and button handlers
    buttons/        # Button interaction handlers
  services/         # External API clients (Discord, OpenAI, Scryfall cache, DB, scheduler)
  middleware/       # Request middleware (signature verification)
  types/           # TypeScript type definitions
  utils/           # Helper functions (PDF generation, sanitization)
```

## Environment Variables

- `DISCORD_PUBLIC_KEY` - Discord application public key (for signature verification)
- `DISCORD_BOT_TOKEN` - Discord bot token
- `DISCORD_APPLICATION_ID` - Discord application ID
- `OPENAI_API_KEY` - OpenAI API key for card parsing
- `DATABASE_URL_DEV` - PostgreSQL connection string for development database (used when `NODE_ENV=development`)
- `DATABASE_URL_PROD` - PostgreSQL connection string for production database (used when `NODE_ENV=production`)
- `DATABASE_URL` - Fallback PostgreSQL connection string (for backward compatibility, only used if environment-specific URL is not set)
- `PORT` - Server port (default: 3000)
- `NODE_ENV` - Environment (`development` or `production`). Controls which database URL is used.
- `PUPPETEER_EXECUTABLE_PATH` - Path to Chromium (set automatically in Docker)
- `SCRYFALL_BULK_DIR` - Optional. Directory for downloaded Scryfall bulk `.json.gz` files (default: `data/scryfall-bulk` under the project root). Only the three newest files are kept.
- `SCRYFALL_BULK_CRON` - Optional. Cron schedule for daily bulk download/import (default: `0 4 * * *`, 04:00 UTC).

## Notes

- The bot uses Puppeteer for PDF generation (replaces Gotenberg). Checklist “yes” cells use an inline SVG checkmark (not native checkboxes or Unicode ✓) so indicators render reliably in color in the exported PDF.
- Card metadata comes from a local PostgreSQL cache populated from Scryfall bulk data (see **Scryfall bulk data** under Database Setup), not per-request Scryfall API calls
- Discord API calls are rate-limited with 500ms delays
- Unmatched cards are reported via ephemeral follow-up message
- Requests are only saved to database after successful processing
- Daily notifications run automatically at 10:00 AM EST (15:00 UTC)
- Business day calculations exclude weekends
- Aging alert messages are automatically split if they exceed Discord's 2000 character limit

