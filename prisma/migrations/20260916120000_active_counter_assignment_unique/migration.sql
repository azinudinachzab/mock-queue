CREATE UNIQUE INDEX "CounterAssignment_active_counter_key"
  ON "CounterAssignment"("counterId")
  WHERE "status" = 'active' AND "unassignedAt" IS NULL;