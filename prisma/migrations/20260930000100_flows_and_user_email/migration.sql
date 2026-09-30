-- AlterTable
ALTER TABLE "User" ADD COLUMN     "email" TEXT;

-- CreateTable
CREATE TABLE "Flow" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT false,
    "graph" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Flow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FlowSession" (
    "id" TEXT NOT NULL,
    "chat_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "flow_id" TEXT,
    "flow_name" TEXT NOT NULL,
    "current_node_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "variables" JSONB NOT NULL DEFAULT '{}',
    "retries" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "FlowSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Flow_company_id_is_active_idx" ON "Flow"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "FlowSession_chat_id_key" ON "FlowSession"("chat_id");

-- CreateIndex
CREATE INDEX "FlowSession_company_id_status_idx" ON "FlowSession"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- AddForeignKey
ALTER TABLE "Flow" ADD CONSTRAINT "Flow_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowSession" ADD CONSTRAINT "FlowSession_chat_id_fkey" FOREIGN KEY ("chat_id") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FlowSession" ADD CONSTRAINT "FlowSession_flow_id_fkey" FOREIGN KEY ("flow_id") REFERENCES "Flow"("id") ON DELETE SET NULL ON UPDATE CASCADE;

