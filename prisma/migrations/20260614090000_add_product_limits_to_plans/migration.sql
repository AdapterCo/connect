ALTER TABLE "Plan" ADD COLUMN "max_products" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Company" ADD COLUMN "max_products" INTEGER NOT NULL DEFAULT 30;

UPDATE "Plan" SET "max_products" = 30 WHERE "name" = 'Essencial';
UPDATE "Plan" SET "max_products" = 50 WHERE "name" = 'Profissional';
UPDATE "Plan" SET "max_products" = 100 WHERE "name" = 'Empresarial';

UPDATE "Company"
SET "max_products" = COALESCE(
  (SELECT "max_products" FROM "Plan" WHERE "Plan"."id" = "Company"."plan_id"),
  30
);
