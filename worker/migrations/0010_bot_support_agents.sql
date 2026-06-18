CREATE TABLE IF NOT EXISTS bot_support_agents (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  name TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  online INTEGER NOT NULL DEFAULT 1,
  weight INTEGER NOT NULL DEFAULT 100,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bot_support_agents_bot
ON bot_support_agents (tenant_id, bot_id, enabled, online);
