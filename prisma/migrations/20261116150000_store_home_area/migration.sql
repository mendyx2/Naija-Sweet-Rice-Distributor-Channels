-- AlterTable
ALTER TABLE "Distributor" ADD COLUMN     "homeZoneId" TEXT;

-- AddForeignKey
ALTER TABLE "Distributor" ADD CONSTRAINT "Distributor_homeZoneId_fkey" FOREIGN KEY ("homeZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Kaura district becomes a delivery area (Gova Max Ltd's shop is there). HQ's fees start as Durumi's, its neighbour.
INSERT INTO "DeliveryZone" ("id", "slug", "name", "kind", "baseFeeKobo", "perKgFeeKobo", "minOrderKg", "minOrderKobo", "etaHours", "terms", "active", "sortOrder")
SELECT 'zone_kaura', 'kaura', 'Kaura', 'ABUJA', d."baseFeeKobo", d."perKgFeeKobo", NULL, NULL, d."etaHours", NULL, true, d."sortOrder"
FROM "DeliveryZone" d WHERE d."slug" = 'durumi'
ON CONFLICT ("slug") DO NOTHING;

-- Gova Max Ltd has one shop: Kaura International Market, Abuja FCT.
UPDATE "Distributor" SET "address" = 'Kaura International Market, Abuja FCT', "homeZoneId" = (SELECT "id" FROM "DeliveryZone" WHERE "slug" = 'kaura')
WHERE "slug" = 'gova-max-ltd';

-- HQ's flagship store is in Wuse II.
UPDATE "Distributor" SET "homeZoneId" = (SELECT "id" FROM "DeliveryZone" WHERE "slug" = 'wuse-ii') WHERE "id" = 'hq' AND "homeZoneId" IS NULL;
