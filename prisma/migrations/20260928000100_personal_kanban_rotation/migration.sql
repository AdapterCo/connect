ALTER TABLE "Company" ADD COLUMN "sales_rotation_cursor" TEXT;
ALTER TABLE "Chat" ADD COLUMN "sales_reply_due_at" TIMESTAMP(3);
CREATE UNIQUE INDEX "Chat_id_company_id_key" ON "Chat"("id", "company_id");
CREATE INDEX "Chat_status_sales_reply_due_at_idx" ON "Chat"("status", "sales_reply_due_at");

CREATE TABLE "KanbanColumn" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KanbanColumn_user_id_company_id_fkey" FOREIGN KEY ("user_id", "company_id") REFERENCES "User"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KanbanColumn_id_user_id_company_id_key" ON "KanbanColumn"("id", "user_id", "company_id");
CREATE UNIQUE INDEX "KanbanColumn_user_id_name_key" ON "KanbanColumn"("user_id", "name");

CREATE TABLE "KanbanCard" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "chat_id" TEXT NOT NULL,
  "column_id" TEXT NOT NULL,
  CONSTRAINT "KanbanCard_column_id_user_id_company_id_fkey" FOREIGN KEY ("column_id", "user_id", "company_id") REFERENCES "KanbanColumn"("id", "user_id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KanbanCard_chat_id_company_id_fkey" FOREIGN KEY ("chat_id", "company_id") REFERENCES "Chat"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "KanbanCard_user_id_chat_id_key" ON "KanbanCard"("user_id", "chat_id");
CREATE INDEX "KanbanCard_column_id_idx" ON "KanbanCard"("column_id");
-- Existing conversations are not reassigned by a schema migration.
-- A new incoming customer message or a new entry into Interest starts the clock.
