ALTER TABLE "Chat" ADD COLUMN "remote_jid" TEXT;

UPDATE "Chat"
SET "remote_jid" = "id"
WHERE "remote_jid" IS NULL;

CREATE INDEX "Chat_remote_jid_idx" ON "Chat"("remote_jid");
CREATE UNIQUE INDEX "Chat_company_id_instance_id_remote_jid_key" ON "Chat"("company_id", "instance_id", "remote_jid");
