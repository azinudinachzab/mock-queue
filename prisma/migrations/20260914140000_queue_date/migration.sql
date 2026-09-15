-- Add direct queue date and update timestamp to queue records.
ALTER TABLE "QueueEntry" ADD COLUMN "queueDate" DATE;
ALTER TABLE "QueueEntry" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "QueueEntry"
SET "queueDate" = ("createdAt" AT TIME ZONE 'UTC')::date;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "QueueEntry" WHERE "queueDate" IS NULL) THEN
        RAISE EXCEPTION 'Cannot backfill QueueEntry.queueDate from createdAt';
    END IF;
END $$;

ALTER TABLE "QueueEntry" ALTER COLUMN "queueDate" SET NOT NULL;