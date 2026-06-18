ALTER TABLE bots ADD COLUMN updated_at TEXT;

INSERT OR IGNORE INTO bots (
  id,
  name,
  username,
  token_masked,
  webhook_path,
  status,
  support_group,
  created_at,
  updated_at
) VALUES
  (
    'bot-main',
    '客服主机器人',
    '@support_bridge_bot',
    '123456:***main',
    '/api/telegram/webhook/main',
    'online',
    '@tg_support_main',
    '2026-06-17 23:16',
    '2026-06-17 23:16'
  ),
  (
    'bot-sales',
    '售前机器人',
    '@sales_bridge_bot',
    '123456:***sales',
    '/api/telegram/webhook/sales',
    'paused',
    '@tg_sales_room',
    '2026-06-17 22:41',
    '2026-06-17 22:41'
  );

INSERT OR IGNORE INTO templates (
  id,
  name,
  scene,
  content,
  enabled,
  updated_at
) VALUES
  (
    'tpl-welcome',
    '欢迎语',
    'first-contact',
    '您好，这里是 Telegram 中转客服，消息已接入人工处理队列。',
    1,
    '2026-06-17 23:16'
  ),
  (
    'tpl-offline',
    '离线回复',
    'off-hours',
    '当前人工客服不在线，您的消息已记录，我们会尽快回复。',
    1,
    '2026-06-17 21:42'
  );
