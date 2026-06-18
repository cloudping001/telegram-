ALTER TABLE templates ADD COLUMN image_url TEXT;
ALTER TABLE templates ADD COLUMN parse_mode TEXT NOT NULL DEFAULT 'plain';
ALTER TABLE templates ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0;
ALTER TABLE templates ADD COLUMN buttons TEXT NOT NULL DEFAULT '[]';
ALTER TABLE templates ADD COLUMN timezone TEXT;
ALTER TABLE templates ADD COLUMN work_start TEXT;
ALTER TABLE templates ADD COLUMN work_end TEXT;

UPDATE templates
SET is_default = 1
WHERE scene IN ('first-contact', 'off-hours') AND id IN ('tpl-welcome', 'tpl-offline');

UPDATE templates
SET timezone = 'Asia/Singapore', work_start = '09:00', work_end = '22:00'
WHERE scene = 'off-hours' AND (timezone IS NULL OR timezone = '');
