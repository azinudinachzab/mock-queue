-- CreateTable
CREATE TABLE "BranchQueueDay" (
    "id" SERIAL NOT NULL,
    "branchCode" TEXT NOT NULL,
    "operatingDate" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchQueueDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BranchQueueDay_branchCode_operatingDate_key"
    ON "BranchQueueDay"("branchCode", "operatingDate");

-- AddForeignKey
ALTER TABLE "BranchQueueDay"
    ADD CONSTRAINT "BranchQueueDay_branchCode_fkey"
    FOREIGN KEY ("branchCode") REFERENCES "Branch"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add branch scope to legacy daily sequences.
ALTER TABLE "DailySequence" ADD COLUMN "branchCode" TEXT;

UPDATE "DailySequence" AS sequence
SET "branchCode" = branch.branch_code
FROM (
    SELECT TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYYMMDD') AS operating_date,
           "serviceType",
           MIN("branchCode") AS branch_code
    FROM "QueueEntry"
    GROUP BY TO_CHAR("createdAt" AT TIME ZONE 'UTC', 'YYYYMMDD'), "serviceType"
    HAVING COUNT(DISTINCT "branchCode") = 1
) AS branch
WHERE sequence."operatingDate" = branch.operating_date
  AND sequence."serviceType" = branch."serviceType";

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "DailySequence" WHERE "branchCode" IS NULL) THEN
        RAISE EXCEPTION 'Cannot backfill DailySequence.branchCode: legacy sequence is ambiguous or has no queue rows';
    END IF;
END $$;

ALTER TABLE "DailySequence" ALTER COLUMN "branchCode" SET NOT NULL;

DROP INDEX "DailySequence_operatingDate_serviceType_key";
CREATE UNIQUE INDEX "DailySequence_operatingDate_branchCode_serviceType_key"
    ON "DailySequence"("operatingDate", "branchCode", "serviceType");

-- AddForeignKey
ALTER TABLE "DailySequence"
    ADD CONSTRAINT "DailySequence_branchCode_fkey"
    FOREIGN KEY ("branchCode") REFERENCES "Branch"("code")
    ON DELETE RESTRICT ON UPDATE CASCADE;
