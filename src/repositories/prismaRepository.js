function createPrismaRepository(prisma) {
  return {
    async findBranchByCode(code) {
      return prisma.branch.findUnique({ where: { code } });
    },
    async listQueue(status) {
      const entries = await prisma.queueEntry.findMany({
        where: status ? { status } : undefined,
        include: { branch: true },
        orderBy: { id: 'asc' },
      });
      return entries.map(toQueueEntry);
    },
    async findQueueByTicket(ticketNumber, branchCode) {
      const entry = await prisma.queueEntry.findFirst({
        where: { ticketNumber, ...(branchCode ? { branchCode } : {}) },
        include: { branch: true },
      });
      return entry ? toQueueEntry(entry) : null;
    },
    async updateQueueStatus(ticketNumber, status) {
      const existing = await prisma.queueEntry.findFirst({ where: { ticketNumber } });
      const entry = await prisma.queueEntry.update({
        where: { id: existing.id },
        data: { status },
        include: { branch: true },
      });
      return toQueueEntry(entry);
    },
    async findActiveStaffAssignment(staff, branchCode) {
      return prisma.counterAssignment.findFirst({
        where: {
          salesAgentId: staff.agentId,
          counterId: staff.counterId,
          status: 'active',
          unassignedAt: null,
          salesAgent: { status: 'active' },
          counter: { status: 'active', branch: { code: branchCode } },
        },
      });
    },
    async createQueueHandling(entry, staff) {
      return prisma.queueHandling.create({
        data: {
          queueId: entry.id,
          salesAgentId: staff.agentId,
          counterId: staff.counterId,
          startTime: new Date(),
          status: 'serving',
        },
      });
    },
    async closeQueueHandling(queueId, status) {
      const handling = await prisma.queueHandling.findFirst({
        where: { queueId, status: 'serving' },
        orderBy: { id: 'desc' },
      });
      if (!handling) return null;
      return prisma.queueHandling.update({
        where: { id: handling.id },
        data: { endTime: new Date(), status },
      });
    },
    async createQueueEntry(input) {
      const entry = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.dailySequence.findUnique({
          where: {
            operatingDate_serviceType: {
              operatingDate: input.operatingDate,
              branchCode: input.branch.code,
              serviceType: input.serviceType,
            },
          },
        });
        const nextNumber = existing ? existing.nextNumber : 1;
        if (existing) {
          await transaction.dailySequence.update({
            where: { id: existing.id },
            data: { nextNumber: { increment: 1 } },
          });
        } else {
          await transaction.dailySequence.create({
            data: {
              operatingDate: input.operatingDate,
              branchCode: input.branch.code,
              serviceType: input.serviceType,
              nextNumber: 2,
            },
          });
        }
        return transaction.queueEntry.create({
          data: {
            ticketNumber: `${input.serviceType}-${String(nextNumber).padStart(3, '0')}`,
            branch: { connect: { code: input.branch.code } },
            name: input.name,
            phoneNumber: input.phoneNumber,
            serviceType: input.serviceType,
          },
          include: { branch: true },
        });
      });
      return toQueueEntry(entry);
    },
  };
}

function toQueueEntry(entry) {
  const { branch, ...queueEntry } = entry;
  return { ...queueEntry, branch: toBranch(branch) };
}

function toBranch(branch) {
  return {
    code: branch.code,
    name: branch.name,
    address: branch.address,
    latitude: branch.latitude,
    longitude: branch.longitude,
    status: branch.status,
  };
}

module.exports = { createPrismaRepository };
