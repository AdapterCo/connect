-- Previa somente leitura. Execute numa copia do banco ANTES de migrate deploy.
-- A migracao nova usa BEGIN/COMMIT e recusa restricoes inconsistentes.
SELECT i.id AS instance_id, i.company_id, u.company_id AS user_company_id
FROM "Instance" i JOIN "User" u ON u.id = i.user_id WHERE i.company_id <> u.company_id;
SELECT company_slug, count(*) FROM "SignupCheckout"
WHERE company_id IS NULL AND status IN ('pending', 'failed', 'processing')
GROUP BY company_slug HAVING count(*) > 1;
SELECT admin_username, count(*) FROM "SignupCheckout"
WHERE company_id IS NULL AND status IN ('pending', 'failed', 'processing')
GROUP BY admin_username HAVING count(*) > 1;
SELECT company_id, count(*) FROM "Subscription"
WHERE status IN ('active', 'pending', 'past_due') GROUP BY company_id HAVING count(*) > 1;
SELECT company_id, count(*) FROM "Flow" WHERE is_active = true GROUP BY company_id HAVING count(*) > 1;
-- Previa dos candidatos da migracao HISTORICA de limpeza. Nao atualiza chats.
SELECT DISTINCT c.id, c.company_id, c.status, c.sales_reply_due_at
FROM "Chat" c JOIN "Chat" s ON c.company_id = s.company_id AND c.client_phone = s.client_phone AND c.id <> s.id
JOIN "Instance" i ON s.instance_id = i.id
WHERE i.user_id IS NOT NULL AND c.status = 'interesse em compra';
-- Se este banco ja foi migrado, consulte separadamente a tabela _prisma_migrations
-- para verificar se 20261001000100_cleanup_duplicate_leads foi aplicada.
