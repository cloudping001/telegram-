INSERT OR IGNORE INTO bot_customers (
  id,
  tenant_id,
  bot_id,
  chat_id,
  username,
  display_name,
  status,
  source,
  message_count,
  last_message,
  first_seen_at,
  last_seen_at
)
SELECT
  'cust-' || c.id,
  c.tenant_id,
  c.bot_id,
  c.customer_chat_id,
  c.customer_username,
  COALESCE(NULLIF(c.customer_name, ''), NULLIF(c.customer_username, ''), c.customer_chat_id),
  'active',
  'conversation',
  COALESCE((
    SELECT COUNT(*)
    FROM message_logs m
    WHERE m.tenant_id = c.tenant_id
      AND m.bot_id = c.bot_id
      AND m.customer_chat_id = c.customer_chat_id
      AND m.direction = 'inbound'
  ), 0),
  COALESCE((
    SELECT m.content
    FROM message_logs m
    WHERE m.tenant_id = c.tenant_id
      AND m.bot_id = c.bot_id
      AND m.customer_chat_id = c.customer_chat_id
      AND m.content IS NOT NULL
      AND m.content <> ''
    ORDER BY m.created_at DESC
    LIMIT 1
  ), ''),
  c.created_at,
  c.last_message_at
FROM conversations c
WHERE c.customer_chat_id IS NOT NULL
  AND c.customer_chat_id <> '';
