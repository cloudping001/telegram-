UPDATE tenants
SET name = '默认用户',
    updated_at = datetime('now')
WHERE id = 'tenant-default'
  AND name = '默认租户';
