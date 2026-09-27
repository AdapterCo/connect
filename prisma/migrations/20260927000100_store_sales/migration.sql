-- Extend the existing catalog; do not recreate Product or remove previous migrations.
CREATE UNIQUE INDEX "User_id_company_id_key" ON "User"("id", "company_id");
ALTER TABLE "Product"
  ADD COLUMN "seller_id" TEXT,
  ADD COLUMN "down_payment" DECIMAL(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN "payment_method" TEXT,
  ADD COLUMN "serial" TEXT,
  ADD COLUMN "color" TEXT,
  ADD COLUMN "memory" TEXT,
  ADD COLUMN "condition" TEXT,
  ADD COLUMN "status" TEXT NOT NULL DEFAULT 'stock',
  ADD COLUMN "sold_at" TIMESTAMP(3);
ALTER TABLE "Product" ADD CONSTRAINT "Product_seller_id_company_id_fkey" FOREIGN KEY ("seller_id", "company_id") REFERENCES "User"("id", "company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "Product_company_id_serial_key" ON "Product"("company_id", "serial");
CREATE INDEX "Product_company_id_seller_id_status_sold_at_idx" ON "Product"("company_id", "seller_id", "status", "sold_at");
ALTER TABLE "Product" ADD CONSTRAINT "Product_sale_values_check" CHECK ("serial" IS NULL OR ("price" > 0 AND "down_payment" >= 0 AND "down_payment" <= "price"));
ALTER TABLE "Product" ADD CONSTRAINT "Product_store_payment_check" CHECK ("payment_method" IS NULL OR "payment_method" IN ('cash','pix','card','boleto'));
ALTER TABLE "Product" ADD CONSTRAINT "Product_store_condition_check" CHECK ("condition" IS NULL OR "condition" IN ('new','used','refurbished'));
ALTER TABLE "Product" ADD CONSTRAINT "Product_store_status_check" CHECK (("status" = 'stock' AND "sold_at" IS NULL) OR ("status" = 'sold' AND "sold_at" IS NOT NULL AND "seller_id" IS NOT NULL AND "serial" IS NOT NULL AND "payment_method" IS NOT NULL));
UPDATE "Company" SET "mp_enabled" = false;
