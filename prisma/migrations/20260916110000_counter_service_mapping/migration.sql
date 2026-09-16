CREATE TABLE "CounterServiceMapping" (
    "id" SERIAL NOT NULL,
    "counterId" INTEGER NOT NULL,
    "serviceId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CounterServiceMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CounterServiceMapping_counterId_serviceId_key"
  ON "CounterServiceMapping"("counterId", "serviceId");
CREATE INDEX "CounterServiceMapping_serviceId_idx"
  ON "CounterServiceMapping"("serviceId");

ALTER TABLE "CounterServiceMapping"
  ADD CONSTRAINT "CounterServiceMapping_counterId_fkey"
  FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CounterServiceMapping"
  ADD CONSTRAINT "CounterServiceMapping_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "CounterServiceMapping" ("counterId", "serviceId")
SELECT "Counter"."id", "Service"."id"
FROM "Counter" CROSS JOIN "Service"
ON CONFLICT DO NOTHING;