-- Add payment_method to Order
ALTER TABLE "Order" ADD COLUMN "payment_method" TEXT;

-- Update existing orders with pending payment to have payment_method
UPDATE "Order" SET "payment_method" = 'mercadopago' WHERE "payment_method" IS NULL AND "payment_status" = 'pending';
