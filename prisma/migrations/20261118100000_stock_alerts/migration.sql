-- AlterTable
ALTER TABLE "DistributorStock" ADD COLUMN     "lowAlertAt" TIMESTAMP(3),
ADD COLUMN     "outAlertAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "lowStockAt" INTEGER;

