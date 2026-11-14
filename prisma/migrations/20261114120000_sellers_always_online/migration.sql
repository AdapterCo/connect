-- Vendedores ficam online por padrao: so saem do rodizio quando escolhem ficar offline.
ALTER TABLE "User" ALTER COLUMN "status" SET DEFAULT 'online';
UPDATE "User" SET "status" = 'online' WHERE "role" = 'seller' AND "status" = 'offline';
