-- CreateTable
CREATE TABLE "SalesAgent" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "employeeId" TEXT NOT NULL,
    "agentName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Counter" (
    "id" SERIAL NOT NULL,
    "branchId" INTEGER NOT NULL,
    "counterCode" TEXT NOT NULL,
    "counterName" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Counter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CounterAssignment" (
    "id" SERIAL NOT NULL,
    "counterId" INTEGER NOT NULL,
    "salesAgentId" INTEGER NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL,
    "unassignedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CounterAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QueueHandling" (
    "id" SERIAL NOT NULL,
    "queueId" INTEGER NOT NULL,
    "salesAgentId" INTEGER NOT NULL,
    "counterId" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QueueHandling_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SalesAgent_employeeId_key" ON "SalesAgent"("employeeId");

-- CreateIndex
CREATE UNIQUE INDEX "Counter_counterCode_key" ON "Counter"("counterCode");

-- CreateIndex
CREATE UNIQUE INDEX "QueueEntry_branchCode_ticketNumber_key" ON "QueueEntry"("branchCode", "ticketNumber");

-- AddForeignKey
ALTER TABLE "SalesAgent" ADD CONSTRAINT "SalesAgent_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Counter" ADD CONSTRAINT "Counter_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterAssignment" ADD CONSTRAINT "CounterAssignment_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CounterAssignment" ADD CONSTRAINT "CounterAssignment_salesAgentId_fkey" FOREIGN KEY ("salesAgentId") REFERENCES "SalesAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueHandling" ADD CONSTRAINT "QueueHandling_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "QueueEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueHandling" ADD CONSTRAINT "QueueHandling_salesAgentId_fkey" FOREIGN KEY ("salesAgentId") REFERENCES "SalesAgent"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueHandling" ADD CONSTRAINT "QueueHandling_counterId_fkey" FOREIGN KEY ("counterId") REFERENCES "Counter"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
