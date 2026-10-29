-- Fila de leads: um lead oferecido por vez ate o aceite de um vendedor.
ALTER TABLE "Chat" ADD COLUMN "queued_at" TIMESTAMP(3);

CREATE INDEX "Chat_company_id_status_queued_at_idx" ON "Chat"("company_id", "status", "queued_at");
