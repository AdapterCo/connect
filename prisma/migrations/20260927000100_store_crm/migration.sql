CREATE UNIQUE INDEX "User_id_company_id_key" ON "User"("id", "company_id");
CREATE TABLE "Product" (
  "id" TEXT NOT NULL,
  "company_id" TEXT NOT NULL,
  "seller_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "price" DECIMAL(12,2) NOT NULL,
  "down_payment" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "payment_method" TEXT NOT NULL,
  "serial" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "memory" TEXT,
  "condition" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'stock',
  "sold_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Product_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Product_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "Product_seller_id_company_id_fkey" FOREIGN KEY ("seller_id", "company_id") REFERENCES "User"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "Product_amounts_check" CHECK ("price" > 0 AND "down_payment" >= 0 AND "down_payment" <= "price"),
  CONSTRAINT "Product_payment_check" CHECK ("payment_method" IN ('cash','pix','card','boleto')),
  CONSTRAINT "Product_condition_check" CHECK ("condition" IN ('new','used','refurbished')),
  CONSTRAINT "Product_status_check" CHECK (("status" = 'stock' AND "sold_at" IS NULL) OR ("status" = 'sold' AND "sold_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "Product_company_id_serial_key" ON "Product"("company_id", "serial");
CREATE INDEX "Product_company_id_seller_id_status_sold_at_idx" ON "Product"("company_id", "seller_id", "status", "sold_at");
-- Keep legacy payment history, but permanently disable the retired integration.
UPDATE "Company" SET "mp_enabled" = false;
