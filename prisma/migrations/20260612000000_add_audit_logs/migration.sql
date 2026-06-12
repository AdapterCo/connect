-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT,
    "user_name" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT,
    "details" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_company_id_timestamp_idx" ON "AuditLog"("company_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_company_id_action_idx" ON "AuditLog"("company_id", "action");

-- CreateIndex
CREATE INDEX "AuditLog_company_id_entity_idx" ON "AuditLog"("company_id", "entity");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
