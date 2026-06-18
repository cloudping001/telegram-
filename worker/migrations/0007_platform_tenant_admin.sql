ALTER TABLE tenants ADD COLUMN plan TEXT NOT NULL DEFAULT 'free';
ALTER TABLE tenants ADD COLUMN updated_at TEXT;
ALTER TABLE tenants ADD COLUMN notes TEXT;

UPDATE tenants
SET updated_at = COALESCE(updated_at, created_at),
    plan = COALESCE(plan, 'free')
WHERE updated_at IS NULL OR plan IS NULL;

CREATE INDEX IF NOT EXISTS idx_tenants_status_plan
ON tenants (status, plan, created_at);
