# MTG Request Bot

Discord bot for processing Magic: The Gathering card requests, migrated from n8n to Node.js/TypeScript.

## Features

- `/request-list` - Submit card requests with automatic parsing and PDF generation
- `/set-request-channel` - Configure the channel where requests are accepted
- `/set-task-channel` - Configure the channel where staff see requests
- Button interactions for completing, cancelling, and tracking print status

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

#### Production Database

Your production database should already exist with the same schema. If you need to verify or recreate it, use the same `scripts/create-dev-schema.sql` script (the script uses `CREATE TABLE IF NOT EXISTS` so it's safe to run multiple times).

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
PORT=3000
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
curl -X POST http://localhost:3000/admin/register-commands
```

**Register commands for a specific guild:**
```bash
curl -X POST "http://localhost:3000/admin/register-commands?guildId=YOUR_GUILD_ID"
```

The endpoint returns a JSON response with registration results, including which commands were registered, skipped (already exist), or encountered errors. The registration is idempotent - running it multiple times won't create duplicate commands.

### 7. Build

Compile TypeScript:

```bash
npm run build
```

## Deployment

### Docker Build (on Raspberry Pi)

1. Copy your code to the Raspberry Pi
2. Ensure `.env` file is configured
3. Build and run:

```bash
docker-compose build
docker-compose up -d
```

4. Monitor logs:

```bash
docker logs -f mtg-request-bot
```

### Production Switchover

1. Test thoroughly with test Discord application
2. Once stable, update production Discord application's Interactions Endpoint URL
3. Verify production bot works correctly
4. Stop n8n workflow

## Project Structure

```
src/
  handlers/          # Command and button handlers
    buttons/         # Button interaction handlers
  services/          # External API clients (Discord, OpenAI, Scryfall, DB)
  middleware/        # Request middleware (signature verification)
  types/            # TypeScript type definitions
  utils/            # Helper functions (PDF generation, sanitization)
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

## Notes

- The bot uses Puppeteer for PDF generation (replaces Gotenberg)
- Scryfall API calls are rate-limited with 100ms delays
- Discord API calls are rate-limited with 500ms delays
- Unmatched cards are reported via ephemeral follow-up message
- Requests are only saved to database after successful processing

