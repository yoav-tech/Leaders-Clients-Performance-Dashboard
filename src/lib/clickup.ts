// ClickUp Chat API (v3) client — outbound messaging + inbound polling for the comms panel.
// Follows the windsor.ts fetch/error convention. Server-only (uses a private API token).
//
// Config (env): CLICKUP_API_TOKEN (pk_…), CLICKUP_WORKSPACE_ID (team id, numeric),
// CLICKUP_CHANNEL_ID (the shared channel, e.g. "6-204891275-8").

const BASE = "https://api.clickup.com/api/v3";

function cfg(): { token: string; workspace: string; channel: string } {
  const token = process.env.CLICKUP_API_TOKEN;
  const workspace = process.env.CLICKUP_WORKSPACE_ID;
  const channel = process.env.CLICKUP_CHANNEL_ID;
  if (!token || !workspace || !channel) {
    throw new Error("ClickUp not configured (CLICKUP_API_TOKEN / CLICKUP_WORKSPACE_ID / CLICKUP_CHANNEL_ID)");
  }
  return { token, workspace, channel };
}

export function clickupConfigured(): boolean {
  return Boolean(
    process.env.CLICKUP_API_TOKEN && process.env.CLICKUP_WORKSPACE_ID && process.env.CLICKUP_CHANNEL_ID,
  );
}

// The ClickUp user id that owns the token — so the poller can ignore the bot's own messages
// (loop guard). Optional; set CLICKUP_BOT_USER_ID if known.
export function botUserId(): string {
  return process.env.CLICKUP_BOT_USER_ID ?? "";
}

async function cuFetch(path: string, init?: RequestInit): Promise<Response> {
  const { token } = cfg();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`ClickUp ${res.status} ${path}: ${body.slice(0, 300)}`);
  }
  return res;
}

// Post a markdown message to the configured channel. Returns the new message id.
export async function postMessage(content: string): Promise<string> {
  const { workspace, channel } = cfg();
  const res = await cuFetch(`/workspaces/${workspace}/chat/channels/${channel}/messages`, {
    method: "POST",
    body: JSON.stringify({ type: "message", content, content_format: "text/md" }),
  });
  const j = (await res.json().catch(() => ({}))) as { data?: { id?: string }; id?: string };
  return String(j.data?.id ?? j.id ?? "");
}

// Reply to a message (used by the Q&A poller to thread answers under the question).
export async function replyToMessage(messageId: string, content: string): Promise<void> {
  const { workspace } = cfg();
  await cuFetch(`/workspaces/${workspace}/chat/messages/${messageId}/replies`, {
    method: "POST",
    body: JSON.stringify({ type: "message", content, content_format: "text/md" }),
  });
}

export interface CuMessage {
  id: string;
  content: string;
  userId: string;
  date: number; // ms epoch
}

// List recent channel messages (newest first). `cursor` paginates older; for polling we read
// the newest page and filter by our stored high-water mark.
export async function listMessages(limit = 50, cursor?: string): Promise<{ messages: CuMessage[]; nextCursor: string }> {
  const { workspace, channel } = cfg();
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set("cursor", cursor);
  const res = await cuFetch(
    `/workspaces/${workspace}/chat/channels/${channel}/messages?${params.toString()}`,
    { method: "GET" },
  );
  const j = (await res.json().catch(() => ({}))) as {
    data?: Array<Record<string, unknown>>;
    next_cursor?: string;
  };
  const messages = (j.data ?? []).map((m) => ({
    id: String(m.id ?? ""),
    content: String(m.content ?? ""),
    userId: String((m.user_id as unknown) ?? (m as { userid?: unknown }).userid ?? ""),
    date: Number(m.date ?? (m as { created_at?: unknown }).created_at ?? 0),
  }));
  return { messages, nextCursor: String(j.next_cursor ?? "") };
}
