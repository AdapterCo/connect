BEGIN;
ALTER TABLE "Plan" ALTER COLUMN "price" TYPE DECIMAL(12,2) USING round("price"::numeric, 2);
ALTER TABLE "Invoice" ALTER COLUMN "amount" TYPE DECIMAL(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "SignupCheckout" ALTER COLUMN "amount" TYPE DECIMAL(12,2) USING round("amount"::numeric, 2);
ALTER TABLE "ScheduledMessage" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "locked_at" TIMESTAMP(3), ADD COLUMN "last_error" TEXT, ADD COLUMN "sent_at" TIMESTAMP(3);
CREATE INDEX "ScheduledMessage_status_next_attempt_at_scheduledTime_idx" ON "ScheduledMessage"("status", "next_attempt_at", "scheduledTime");
DROP INDEX IF EXISTS "ScheduledMessage_scheduledTime_idx";
ALTER TABLE "FlowSession" ADD COLUMN "graph_snapshot" JSONB;
UPDATE "FlowSession" s SET "graph_snapshot" = f.graph FROM "Flow" f WHERE f.id = s.flow_id;
CREATE TABLE "PaymentAttempt" (
  "id" TEXT NOT NULL PRIMARY KEY, "charge_id" TEXT NOT NULL, "charge_type" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL, "mp_payment_id" TEXT, "status" TEXT NOT NULL DEFAULT 'creating',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "checked_at" TIMESTAMP(3)
);
CREATE UNIQUE INDEX "PaymentAttempt_idempotency_key_key" ON "PaymentAttempt"("idempotency_key");
CREATE UNIQUE INDEX "PaymentAttempt_mp_payment_id_key" ON "PaymentAttempt"("mp_payment_id");
CREATE INDEX "PaymentAttempt_status_checked_at_idx" ON "PaymentAttempt"("status", "checked_at");
CREATE INDEX "PaymentAttempt_charge_id_idx" ON "PaymentAttempt"("charge_id");
INSERT INTO "PaymentAttempt" (id, charge_id, charge_type, idempotency_key, mp_payment_id, status)
SELECT 'legacy-invoice-' || id, id, 'invoice', 'legacy-invoice-' || id, mp_payment_id, 'pending'
FROM "Invoice" WHERE mp_payment_id IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO "PaymentAttempt" (id, charge_id, charge_type, idempotency_key, mp_payment_id, status)
SELECT 'legacy-signup-' || id, id, 'signup', 'legacy-signup-' || id, mp_payment_id, 'pending'
FROM "SignupCheckout" WHERE mp_payment_id IS NOT NULL
ON CONFLICT DO NOTHING;
CREATE TABLE "MediaDeletion" (url TEXT NOT NULL PRIMARY KEY, created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, attempts INTEGER NOT NULL DEFAULT 0);
CREATE INDEX "MediaDeletion_created_at_idx" ON "MediaDeletion"("created_at");
CREATE INDEX "Message_chat_id_timestamp_idx" ON "Message"(chat_id, timestamp);
CREATE INDEX "Log_company_id_timestamp_idx" ON "Log"(company_id, timestamp);
CREATE INDEX "AuditLog_company_id_timestamp_idx" ON "AuditLog"(company_id, timestamp);
-- Nao altera conversas historicas: o criterio de telefone nao prova duplicidade.
-- Apenas impede novos vinculos de instancia a usuario de outra empresa.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Instance" i JOIN "User" u ON u.id = i.user_id WHERE i.company_id <> u.company_id) THEN
    RAISE EXCEPTION 'Corrija os vinculos Instance/User entre empresas antes de migrar';
  END IF;
END $$;
ALTER TABLE "Instance" ADD CONSTRAINT "Instance_user_tenant_fkey" FOREIGN KEY (user_id, company_id) REFERENCES "User"(id, company_id) ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE UNIQUE INDEX "SignupCheckout_open_slug_key" ON "SignupCheckout"(company_slug) WHERE company_id IS NULL AND status IN ('pending', 'failed', 'processing');
CREATE UNIQUE INDEX "SignupCheckout_open_username_key" ON "SignupCheckout"(admin_username) WHERE company_id IS NULL AND status IN ('pending', 'failed', 'processing');

CREATE UNIQUE INDEX "Subscription_current_company_key" ON "Subscription"(company_id) WHERE status IN ('active', 'pending', 'past_due');
CREATE UNIQUE INDEX "Flow_active_company_key" ON "Flow"(company_id) WHERE is_active = true;
COMMIT;
