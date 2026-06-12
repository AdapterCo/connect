-- AlterTable
ALTER TABLE "Category" ADD COLUMN "printer_id" TEXT;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_printer_id_fkey" FOREIGN KEY ("printer_id") REFERENCES "Printer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
