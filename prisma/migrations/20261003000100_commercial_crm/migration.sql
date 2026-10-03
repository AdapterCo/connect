BEGIN;

-- AlterTable
ALTER TABLE "Chat" ADD COLUMN     "opportunity_id" TEXT,
ADD COLUMN     "sales_alerted_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
ADD COLUMN     "cost" DECIMAL(12,2),
ADD COLUMN     "reserved_by" TEXT,
ADD COLUMN     "reserved_lead_id" TEXT,
ADD COLUMN     "reserved_until" TIMESTAMP(3),
ADD COLUMN     "supplier_name" TEXT;

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "seller_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "product" TEXT,
    "variant" TEXT,
    "payment" TEXT,
    "purchase_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "lost_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowUpTask" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "opportunity_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "due_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    "reminded_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FollowUpTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CannedReply" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CannedReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "opportunity_id" TEXT,
    "product_id" TEXT NOT NULL,
    "seller_id" TEXT NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "cost" DECIMAL(12,2),
    "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "payment_method" TEXT NOT NULL,
    "due_at" TIMESTAMP(3),
    "warranty_until" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'sold',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleReceipt" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'payment',
    "method" TEXT NOT NULL,
    "reference" TEXT,
    "request_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SaleReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AfterSale" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "sale_id" TEXT NOT NULL,
    "created_by" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "resolution" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AfterSale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "session_version" INTEGER NOT NULL,
    "endpoint" TEXT NOT NULL,
    "keys" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformConfig" (
    "name" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "PlatformConfig_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "Opportunity_company_id_seller_id_status_idx" ON "Opportunity"("company_id", "seller_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_company_id_phone_key" ON "Opportunity"("company_id", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_id_company_id_key" ON "Opportunity"("id", "company_id");

-- CreateIndex
CREATE INDEX "FollowUpTask_company_id_owner_id_due_at_idx" ON "FollowUpTask"("company_id", "owner_id", "due_at");

-- CreateIndex
CREATE INDEX "CannedReply_company_id_idx" ON "CannedReply"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_product_id_key" ON "Sale"("product_id");

-- CreateIndex
CREATE INDEX "Sale_company_id_seller_id_created_at_idx" ON "Sale"("company_id", "seller_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_product_id_company_id_key" ON "Sale"("product_id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_id_company_id_key" ON "Sale"("id", "company_id");

-- CreateIndex
CREATE UNIQUE INDEX "SaleReceipt_request_id_key" ON "SaleReceipt"("request_id");

-- CreateIndex
CREATE INDEX "SaleReceipt_company_id_sale_id_idx" ON "SaleReceipt"("company_id", "sale_id");

-- CreateIndex
CREATE INDEX "AfterSale_company_id_status_created_at_idx" ON "AfterSale"("company_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_company_id_user_id_idx" ON "PushSubscription"("company_id", "user_id");

-- CreateIndex
CREATE INDEX "Product_company_id_reserved_until_idx" ON "Product"("company_id", "reserved_until");

-- CreateIndex
CREATE UNIQUE INDEX "Product_id_company_id_key" ON "Product"("id", "company_id");

-- AddForeignKey
ALTER TABLE "Chat" ADD CONSTRAINT "Chat_opportunity_id_company_id_fkey" FOREIGN KEY ("opportunity_id", "company_id") REFERENCES "Opportunity"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_reserved_by_company_id_fkey" FOREIGN KEY ("reserved_by", "company_id") REFERENCES "User"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_reserved_lead_id_company_id_fkey" FOREIGN KEY ("reserved_lead_id", "company_id") REFERENCES "Opportunity"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_seller_id_company_id_fkey" FOREIGN KEY ("seller_id", "company_id") REFERENCES "User"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_owner_id_company_id_fkey" FOREIGN KEY ("owner_id", "company_id") REFERENCES "User"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowUpTask" ADD CONSTRAINT "FollowUpTask_opportunity_id_company_id_fkey" FOREIGN KEY ("opportunity_id", "company_id") REFERENCES "Opportunity"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CannedReply" ADD CONSTRAINT "CannedReply_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_seller_id_company_id_fkey" FOREIGN KEY ("seller_id", "company_id") REFERENCES "User"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_product_id_company_id_fkey" FOREIGN KEY ("product_id", "company_id") REFERENCES "Product"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_opportunity_id_company_id_fkey" FOREIGN KEY ("opportunity_id", "company_id") REFERENCES "Opportunity"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReceipt" ADD CONSTRAINT "SaleReceipt_created_by_company_id_fkey" FOREIGN KEY ("created_by", "company_id") REFERENCES "User"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReceipt" ADD CONSTRAINT "SaleReceipt_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleReceipt" ADD CONSTRAINT "SaleReceipt_sale_id_company_id_fkey" FOREIGN KEY ("sale_id", "company_id") REFERENCES "Sale"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSale" ADD CONSTRAINT "AfterSale_created_by_company_id_fkey" FOREIGN KEY ("created_by", "company_id") REFERENCES "User"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSale" ADD CONSTRAINT "AfterSale_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AfterSale" ADD CONSTRAINT "AfterSale_sale_id_company_id_fkey" FOREIGN KEY ("sale_id", "company_id") REFERENCES "Sale"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_user_id_company_id_fkey" FOREIGN KEY ("user_id", "company_id") REFERENCES "User"("id", "company_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Enforce money/state invariants even for writes outside the HTTP API.
CREATE INDEX "FollowUpTask_completed_at_reminded_at_due_at_idx" ON "FollowUpTask" (completed_at, reminded_at, due_at);
ALTER TABLE "Product" DROP CONSTRAINT "Product_store_status_check";
ALTER TABLE "Product" ADD CONSTRAINT "Product_store_status_check" CHECK (
  (status = 'stock' AND sold_at IS NULL) OR
  (status IN ('sold', 'returned') AND sold_at IS NOT NULL AND seller_id IS NOT NULL AND serial IS NOT NULL AND payment_method IS NOT NULL)
);
ALTER TABLE "Product" ADD CONSTRAINT "Product_commercial_values_check" CHECK ((cost IS NULL OR cost >= 0) AND commission_rate BETWEEN 0 AND 100);
ALTER TABLE "Product" ADD CONSTRAINT "Product_reservation_complete_check" CHECK (
  (reserved_by IS NULL AND reserved_until IS NULL AND reserved_lead_id IS NULL) OR
  (reserved_by IS NOT NULL AND reserved_until IS NOT NULL AND reserved_lead_id IS NOT NULL)
);
ALTER TABLE "Sale" ADD CONSTRAINT "Sale_values_check" CHECK (total > 0 AND (cost IS NULL OR cost >= 0) AND commission_rate BETWEEN 0 AND 100 AND status IN ('sold', 'returned'));
ALTER TABLE "SaleReceipt" ADD CONSTRAINT "SaleReceipt_values_check" CHECK (amount > 0 AND kind IN ('payment', 'refund') AND method IN ('cash', 'pix', 'card', 'boleto'));
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_status_check" CHECK (status IN ('open', 'won', 'lost'));
ALTER TABLE "AfterSale" ADD CONSTRAINT "AfterSale_state_check" CHECK (type IN ('warranty', 'return', 'support') AND status IN ('open', 'resolved', 'returned'));

-- Preserve valid historical sales. No receipt, cost, customer or commission is invented.
INSERT INTO "Sale" (id, company_id, product_id, seller_id, total, payment_method, status, created_at)
SELECT 'legacy-sale-' || p.id, p.company_id, p.id, p.seller_id, round(p.price::numeric, 2), p.payment_method, 'sold', COALESCE(p.sold_at, p.updated_at)
FROM "Product" p
WHERE p.status = 'sold' AND p.seller_id IS NOT NULL AND p.price > 0 AND p.price < 10000000000
  AND p.payment_method IN ('cash', 'pix', 'card', 'boleto');

COMMIT;

