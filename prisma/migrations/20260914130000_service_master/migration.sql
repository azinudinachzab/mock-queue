-- CreateTable
CREATE TABLE "Service" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Service_code_key" ON "Service"("code");

ALTER TABLE "QueueEntry" ADD COLUMN "serviceId" INTEGER;

INSERT INTO "Service" ("code", "name", "status", "updatedAt") VALUES
    ('HM', 'Home Financing', 'active', CURRENT_TIMESTAMP),
    ('SF', 'Service Financing', 'active', CURRENT_TIMESTAMP),
    ('PR', 'Personal', 'active', CURRENT_TIMESTAMP),
    ('RG', 'Registration', 'active', CURRENT_TIMESTAMP),
    ('LL', 'Loan Liaison', 'active', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

UPDATE "QueueEntry" AS queue_entry
SET "serviceId" = service.id
FROM "Service" AS service
WHERE service.code = queue_entry."serviceType";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "QueueEntry" WHERE "serviceId" IS NULL) THEN
        RAISE EXCEPTION 'Cannot backfill QueueEntry.serviceId: unknown serviceType exists';
    END IF;
END $$;

ALTER TABLE "QueueEntry" ALTER COLUMN "serviceId" SET NOT NULL;
ALTER TABLE "QueueEntry"
    ADD CONSTRAINT "QueueEntry_serviceId_fkey"
    FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "QueueEntry_serviceId_idx" ON "QueueEntry"("serviceId");