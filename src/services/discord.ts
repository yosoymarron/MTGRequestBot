const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const APPLICATION_ID = process.env.DISCORD_APPLICATION_ID;

if (!BOT_TOKEN) {
  throw new Error('DISCORD_BOT_TOKEN environment variable is required');
}

if (!APPLICATION_ID) {
  throw new Error('DISCORD_APPLICATION_ID environment variable is required');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function discordRequest(
  endpoint: string,
  options: RequestInit = {}
): Promise<any> {
  const url = `https://discord.com/api/v10${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bot ${BOT_TOKEN}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Discord API error: ${response.status} - ${errorText}`;
    
    // Provide helpful error messages for common issues
    if (response.status === 403) {
      try {
        const errorJson = JSON.parse(errorText);
        if (errorJson.code === 50001) {
          // Extract channel ID from endpoint if possible
          const channelMatch = endpoint.match(/\/channels\/(\d+)/);
          const channelId = channelMatch ? channelMatch[1] : 'unknown';
          errorMessage = `Discord API error: Missing Access (403) - The bot does not have permission to access channel ${channelId}. Please ensure the bot has the required permissions.`;
        }
      } catch {
        // If parsing fails, use original error message
      }
    }
    
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function sendDiscordMessage(
  channelId: string,
  content: string,
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
  }>,
  components?: Array<{
    type: number;
    components: Array<{
      type: number;
      style?: number;
      label: string;
      custom_id?: string;
      disabled?: boolean;
    }>;
  }>,
  files?: Array<{
    name: string;
    data: Buffer;
  }>
): Promise<any> {
  await sleep(500); // Rate limit delay

  if (files && files.length > 0) {
    // Use multipart/form-data for file uploads
    const boundary = `----WebKitFormBoundary${Math.random().toString(36).substring(2)}`;
    const payload: any = {
      content,
    };
    if (embeds) payload.embeds = embeds;
    if (components) payload.components = components;

    const parts: Buffer[] = [];
    
    // Add payload_json part
    parts.push(Buffer.from(`--${boundary}\r\n`));
    parts.push(Buffer.from(`Content-Disposition: form-data; name="payload_json"\r\n`));
    parts.push(Buffer.from(`Content-Type: application/json\r\n\r\n`));
    parts.push(Buffer.from(JSON.stringify(payload)));
    parts.push(Buffer.from(`\r\n`));

    // Add file parts
    files.forEach((file) => {
      parts.push(Buffer.from(`--${boundary}\r\n`));
      parts.push(Buffer.from(`Content-Disposition: form-data; name="file"; filename="${file.name}"\r\n`));
      parts.push(Buffer.from(`Content-Type: application/pdf\r\n\r\n`));
      parts.push(file.data);
      parts.push(Buffer.from(`\r\n`));
    });

    parts.push(Buffer.from(`--${boundary}--\r\n`));

    const body = Buffer.concat(parts);

    const response = await fetch(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bot ${BOT_TOKEN}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: body,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = `Discord API error: ${response.status} - ${errorText}`;
      
      // Provide helpful error messages for common issues
      if (response.status === 403) {
        try {
          const errorJson = JSON.parse(errorText);
          if (errorJson.code === 50001) {
            errorMessage = `Discord API error: Missing Access (403) - The bot does not have permission to send messages or attach files in channel ${channelId}. Please ensure the bot has "View Channel", "Send Messages", and "Attach Files" permissions in the task channel.`;
          }
        } catch {
          // If parsing fails, use original error message
        }
      }
      
      throw new Error(errorMessage);
    }

    return response.json();
  } else {
    return discordRequest(`/channels/${channelId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        content,
        embeds,
        components,
      }),
    });
  }
}

export async function updateDiscordMessage(
  channelId: string,
  messageId: string,
  content?: string,
  components?: Array<{
    type: number;
    components: Array<{
      type: number;
      style?: number;
      label: string;
      custom_id?: string;
      disabled?: boolean;
    }>;
  }>
): Promise<any> {
  await sleep(500); // Rate limit delay

  const payload: any = {};
  if (content !== undefined) payload.content = content;
  if (components !== undefined) payload.components = components;

  return discordRequest(`/channels/${channelId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function followUpMessage(
  applicationId: string,
  token: string,
  content: string,
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
  }>,
  flags?: number
): Promise<any> {
  await sleep(500); // Rate limit delay

  return discordRequest(
    `/webhooks/${applicationId}/${token}`,
    {
      method: 'POST',
      body: JSON.stringify({
        content,
        embeds,
        flags, // 64 = ephemeral
      }),
    }
  );
}

export async function updateInteractionResponse(
  applicationId: string,
  token: string,
  content: string,
  embeds?: Array<{
    title?: string;
    description?: string;
    color?: number;
  }>
): Promise<any> {
  await sleep(500); // Rate limit delay

  return discordRequest(
    `/webhooks/${applicationId}/${token}/messages/@original`,
    {
      method: 'PATCH',
      body: JSON.stringify({
        content,
        embeds,
      }),
    }
  );
}

export async function getChannelMessages(
  channelId: string,
  limit: number = 100
): Promise<any[]> {
  await sleep(500); // Rate limit delay

  return discordRequest(
    `/channels/${channelId}/messages?limit=${limit}`
  );
}

