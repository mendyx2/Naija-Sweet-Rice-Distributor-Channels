-- AlterEnum
ALTER TYPE "ZoneKind" ADD VALUE 'AREA';

-- AlterTable
ALTER TABLE "DeliveryZone" ADD COLUMN     "state" TEXT NOT NULL DEFAULT 'FCT';


-- Nearby towns sit in neighbouring states.
UPDATE "DeliveryZone" SET "state" = 'Niger' WHERE "slug" IN ('suleja', 'madalla');
UPDATE "DeliveryZone" SET "state" = 'Nasarawa' WHERE "slug" IN ('mararaba', 'karu', 'masaka');
CREATE INDEX "DeliveryZone_state_idx" ON "DeliveryZone"("state");
