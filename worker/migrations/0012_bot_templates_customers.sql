ALTER TABLE templates ADD COLUMN bot_id TEXT;

UPDATE templates
SET bot_id = ''
WHERE bot_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_templates_tenant_bot_scene
ON templates (tenant_id, bot_id, scene, updated_at DESC);

INSERT OR IGNORE INTO templates (
  tenant_id,
  id,
  name,
  scene,
  content,
  enabled,
  updated_at,
  image_url,
  parse_mode,
  is_default,
  buttons,
  timezone,
  work_start,
  work_end,
  bot_id
)
SELECT
  t.tenant_id,
  t.id || '-' || b.id,
  t.name,
  t.scene,
  t.content,
  t.enabled,
  datetime('now'),
  t.image_url,
  t.parse_mode,
  t.is_default,
  t.buttons,
  t.timezone,
  t.work_start,
  t.work_end,
  b.id
FROM templates t
INNER JOIN bots b ON b.tenant_id = t.tenant_id
WHERE COALESCE(t.bot_id, '') = '';

CREATE TABLE IF NOT EXISTS bot_customers (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  bot_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  username TEXT,
  display_name TEXT,
  first_name TEXT,
  last_name TEXT,
  language_code TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  source TEXT NOT NULL DEFAULT 'message',
  message_count INTEGER NOT NULL DEFAULT 0,
  last_message TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  UNIQUE (tenant_id, bot_id, chat_id)
);

CREATE INDEX IF NOT EXISTS idx_bot_customers_bot_seen
ON bot_customers (tenant_id, bot_id, status, last_seen_at DESC);
