ALTER TABLE "Service"
  ADD COLUMN "queueType" TEXT NOT NULL DEFAULT 'regular';

ALTER TABLE "Counter"
  ADD COLUMN "counterType" TEXT NOT NULL DEFAULT 'regular';

UPDATE "Service"
SET "queueType" = 'priority'
WHERE "code" = 'PR';