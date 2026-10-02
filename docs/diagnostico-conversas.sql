-- Somente leitura. Execute no banco para investigar os cards duplicados.
-- Mesma pessoa em conexoes diferentes nao deve ser mesclada automaticamente.
SELECT c.company_id, c.instance_id, i.name AS connection_name,
       c.id, c.remote_jid, c.client_name, c.client_phone, c.status,
       c.assigned_to, c.ai_active, c.created_at,
       (SELECT count(*) FROM "Message" m WHERE m.chat_id = c.id) AS messages
FROM "Chat" c
JOIN "Instance" i ON i.id = c.instance_id
WHERE c.client_phone IN (
  SELECT client_phone FROM "Chat"
  GROUP BY company_id, client_phone HAVING count(*) > 1
)
ORDER BY c.company_id, c.client_phone, c.instance_id, c.created_at;
