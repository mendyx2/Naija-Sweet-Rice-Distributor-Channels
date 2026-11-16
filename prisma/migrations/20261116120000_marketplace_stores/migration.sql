-- CreateEnum
CREATE TYPE "Fulfillment" AS ENUM ('DELIVERY', 'PICKUP');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DistributorStatus" ADD VALUE 'PENDING';
ALTER TYPE "DistributorStatus" ADD VALUE 'REJECTED';

-- Several stores can now serve one area. A store covers an area when it has a delivery fee for it.
-- Make that match today's one-store-per-area assignment before the old column goes:
-- 1) every assigned area gets a fee row (copied from HQ's fee if the store never set one);
INSERT INTO "DistributorZoneFee" ("distributorId", "zoneId", "baseFeeKobo", "perKgFeeKobo", "minOrderKg", "minOrderKobo", "etaHours", "terms", "updatedAt")
SELECT z."distributorId", z."id", z."baseFeeKobo", z."perKgFeeKobo", z."minOrderKg", z."minOrderKobo", z."etaHours", z."terms", CURRENT_TIMESTAMP
FROM "DeliveryZone" z
WHERE z."distributorId" IS NOT NULL AND z."distributorId" <> 'hq'
ON CONFLICT ("distributorId", "zoneId") DO NOTHING;
-- 2) fee rows left over from areas a store no longer had are removed.
DELETE FROM "DistributorZoneFee" f USING "DeliveryZone" z
WHERE f."zoneId" = z."id" AND z."distributorId" IS DISTINCT FROM f."distributorId";

-- DropForeignKey
ALTER TABLE "DeliveryZone" DROP CONSTRAINT "DeliveryZone_distributorId_fkey";

-- AlterTable
ALTER TABLE "DeliveryZone" DROP COLUMN "distributorId";

-- AlterTable
ALTER TABLE "Distributor" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "cacNumber" TEXT,
ADD COLUMN     "joinsHqPromotions" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pickupEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "fulfillment" "Fulfillment" NOT NULL DEFAULT 'DELIVERY';


-- Pickup is now a choice on the order (collect from the chosen store), not a delivery area.
UPDATE "Order" o SET "fulfillment" = 'PICKUP' FROM "DeliveryZone" z WHERE o."zoneId" = z."id" AND z."kind" = 'PICKUP';
UPDATE "DeliveryZone" SET "active" = false WHERE "kind" = 'PICKUP';

-- Stores that already exist were set up by HQ: count them as approved, and keep them in HQ promotions
-- as before (they can opt out). New sign-ups start outside HQ promotions until they opt in.
UPDATE "Distributor" SET "approvedAt" = "createdAt", "approvedBy" = 'hq:setup', "joinsHqPromotions" = true;
