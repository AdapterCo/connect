BEGIN;
CREATE TABLE "ProductModel" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('phone','motorcycle')),
  "price" DECIMAL(12,2) NOT NULL CHECK ("price" > 0),
  "cost" DECIMAL(12,2) CHECK ("cost" >= 0),
  "commission_rate" DECIMAL(5,2) NOT NULL DEFAULT 0 CHECK ("commission_rate" BETWEEN 0 AND 100),
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductModel_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ProductModel_id_company_id_key" ON "ProductModel"("id","company_id");
CREATE UNIQUE INDEX "ProductModel_company_id_name_key" ON "ProductModel"("company_id","name");
CREATE INDEX "ProductModel_company_id_is_active_idx" ON "ProductModel"("company_id","is_active");
ALTER TABLE "Product" ADD COLUMN "model_id" TEXT;
ALTER TABLE "Product" ADD CONSTRAINT "Product_model_id_company_id_fkey" FOREIGN KEY ("model_id","company_id") REFERENCES "ProductModel"("id","company_id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Preserve historical units and sales. Reuse a catalog entry per exact product name.
INSERT INTO "ProductModel" ("id","company_id","name","kind","price","cost","commission_rate","updated_at")
SELECT 'model-' || "id", "company_id", "name",
  CASE WHEN "name" ~* '(moto|honda|yamaha|suzuki|kawasaki|bajaj)' THEN 'motorcycle' ELSE 'phone' END,
  "price", "cost", "commission_rate", CURRENT_TIMESTAMP
FROM (SELECT DISTINCT ON ("company_id","name") * FROM "Product"
  WHERE "price" > 0 AND "price" < 10000000000 AND "price"::text NOT IN ('NaN','Infinity','-Infinity')
    AND round("price"::numeric, 2) <= 9999999999.99
  ORDER BY "company_id","name","created_at" DESC,"id") p;
UPDATE "Product" p SET "model_id"=m."id" FROM "ProductModel" m WHERE p."company_id"=m."company_id" AND p."name"=m."name";
COMMIT;
