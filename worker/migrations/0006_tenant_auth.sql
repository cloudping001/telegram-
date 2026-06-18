ALTER TABLE tenant_users ADD COLUMN password_hash TEXT;
ALTER TABLE tenant_users ADD COLUMN display_name TEXT;
ALTER TABLE tenant_users ADD COLUMN email TEXT;
ALTER TABLE tenant_users ADD COLUMN updated_at TEXT;
ALTER TABLE tenant_users ADD COLUMN last_login_at TEXT;

UPDATE tenant_users
SET display_name = COALESCE(display_name, username),
    updated_at = COALESCE(updated_at, created_at)
WHERE updated_at IS NULL OR display_name IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_tenant_users_username
ON tenant_users (lower(username));

CREATE INDEX IF NOT EXISTS idx_tenant_users_tenant
ON tenant_users (tenant_id, status, created_at);

CREATE TABLE IF NOT EXISTS tenant_settings (
  tenant_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (tenant_id, key)
);

INSERT OR IGNORE INTO tenant_settings (tenant_id, key, value, updated_at)
SELECT 'tenant-default', key, value, updated_at
FROM system_settings;
