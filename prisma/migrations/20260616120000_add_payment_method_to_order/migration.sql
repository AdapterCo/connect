-- Add payment_method to Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "payment_method" TEXT;

-- Update existing orders with pending payment to have payment_method
UPDATE "Order" SET "payment_method" = 'mercadopago' WHERE "payment_method" IS NULL AND "payment_status" = 'pending';
