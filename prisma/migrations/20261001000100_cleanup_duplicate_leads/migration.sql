UPDATE "Chat" c
SET status = 'finalizada', sales_reply_due_at = NULL
FROM "Chat" s
JOIN "Instance" i ON s.instance_id = i.id
WHERE c.company_id = s.company_id
  AND c.client_phone = s.client_phone
  AND c.id != s.id
  AND i.user_id IS NOT NULL
  AND c.status = 'interesse em compra';
