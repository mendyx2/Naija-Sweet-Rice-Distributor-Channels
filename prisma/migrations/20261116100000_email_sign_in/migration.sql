-- Soft launch without SMS: people sign in with an email code instead of an SMS code.

-- Accounts no longer need a phone number (it is collected at checkout for delivery).
ALTER TABLE "User" ALTER COLUMN "phone" DROP NOT NULL;

-- Store emails in lower case so sign-in matches regardless of how they were typed.
UPDATE "User" SET "email" = lower(trim("email")) WHERE "email" IS NOT NULL;

-- Sign-in codes are now sent to an email address. Old SMS codes are short-lived and can be dropped.
DELETE FROM "OtpCode";
DROP INDEX IF EXISTS "OtpCode_phone_createdAt_idx";
ALTER TABLE "OtpCode" RENAME COLUMN "phone" TO "email";
CREATE INDEX "OtpCode_email_createdAt_idx" ON "OtpCode"("email", "createdAt");

-- Correct the first distributor's address (Kaura, not Laura).
UPDATE "Distributor" SET "address" = 'Kaura Internal Market, Abuja FCT' WHERE "address" = 'Laura Internal Market, Abuja FCT';
