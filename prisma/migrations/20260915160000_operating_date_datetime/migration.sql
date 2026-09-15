-- Convert the YYYYMMDD operating-date keys to UTC midnight timestamps.
ALTER TABLE "DailySequence"
  ALTER COLUMN "operatingDate" TYPE TIMESTAMP(3)
  USING (to_timestamp("operatingDate", 'YYYYMMDD') AT TIME ZONE 'UTC');

ALTER TABLE "BranchQueueDay"
  ALTER COLUMN "operatingDate" TYPE TIMESTAMP(3)
  USING (to_timestamp("operatingDate", 'YYYYMMDD') AT TIME ZONE 'UTC');