CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO tenants (id, name, status, created_at)
VALUES ('tenant-default', '默认租户', 'active', datetime('now'));

ALTER TABLE bots ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-default';
ALTER TABLE templates ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'tenant-default';

CREATE TABLE IF NOT EXISTS tenant_users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  username TEXT NOT NULL,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL
);

INSERT OR IGNORE INTO tenant_users (id, tenant_id, username, role, status, created_at)
VALUES ('user-default-admin', 'tenant-default', 'admin', 'owner', 'active', datetime('now'));

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  customer_chat_id TEXT NOT NULL,
  customer_username TEXT,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  last_message_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (tenant_id, bot_id, customer_chat_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_tenant_status
ON conversations (tenant_id, status, last_message_at);

CREATE TABLE IF NOT EXISTS message_logs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  conversation_id TEXT,
  bot_id TEXT NOT NULL,
  direction TEXT NOT NULL,
  message_type TEXT NOT NULL,
  scene TEXT,
  customer_chat_id TEXT,
  support_chat_id TEXT,
  telegram_message_id TEXT,
  related_message_id TEXT,
  content TEXT,
  media_file_id TEXT,
  media_caption TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  error TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_message_logs_tenant_created
ON message_logs (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_logs_conversation_created
ON message_logs (conversation_id, created_at DESC);
