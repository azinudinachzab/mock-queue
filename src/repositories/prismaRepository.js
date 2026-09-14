function createPrismaRepository(prisma) {
  return {
    async findBranchByCode(code) {
      return prisma.branch.findUnique({ where: { code } });
    },
    async findServiceByCode(code) {
      return prisma.service.findUnique({ where: { code } });
    },
    async findStaffBranch(agentId) {
      const agent = await prisma.salesAgent.findUnique({ where: { id: agentId }, include: { branch: true } });
      return agent && agent.status === 'active' ? { code: agent.branch.code } : null;
    },
    async getStaffBranch(agentId, branchCode) {
      const agent = await prisma.salesAgent.findUnique({ where: { id: agentId }, include: { branch: true } });
      if (!agent || agent.status !== 'active') return { error: 'Staff agent is not active', forbidden: true };
      if (branchCode && agent.branch.code !== branchCode) return { error: 'Staff agent is not assigned to this branch', forbidden: true };
      return { branchCode: agent.branch.code };
    },
    async listSalesAgents(branchCode) {
      const agents = await prisma.salesAgent.findMany({ where: { branch: { code: branchCode } }, include: { branch: true }, orderBy: { id: 'asc' } });
      return agents.map(toSalesAgent);
    },
    async findSalesAgent(id) {
      const agent = await prisma.salesAgent.findUnique({ where: { id }, include: { branch: true } });
      return agent ? toSalesAgent(agent) : null;
    },
    async createSalesAgent(input) {
      const agent = await prisma.salesAgent.create({
        data: {
          employeeId: input.employeeId,
          agentName: input.agentName,
          status: input.status || 'active',
          branch: { connect: { code: input.branchCode } },
        },
        include: { branch: true },
      });
      return toSalesAgent(agent);
    },
    async updateSalesAgent(id, input) {
      const data = {};
      for (const field of ['employeeId', 'agentName', 'status']) if (input[field] !== undefined) data[field] = input[field];
      if (input.branchCode) data.branch = { connect: { code: input.branchCode } };
      const agent = await prisma.salesAgent.update({ where: { id }, data, include: { branch: true } });
      return toSalesAgent(agent);
    },
    async listCounters(branchCode) {
      return prisma.counter.findMany({ where: { branch: { code: branchCode } }, orderBy: { id: 'asc' } });
    },
    async findCounter(counterId) {
      const counter = await prisma.counter.findUnique({ where: { id: counterId }, include: { branch: true } });
      return counter ? { ...counter, branchCode: counter.branch.code } : null;
    },
    async createCounter(input) {
      return prisma.counter.create({
        data: {
          counterCode: input.counterCode,
          counterName: input.counterName,
          status: input.status || 'active',
          branch: { connect: { code: input.branchCode } },
        },
      });
    },
    async assignCounter(counterId, salesAgentId) {
      return prisma.counterAssignment.create({
        data: {
          counterId,
          salesAgentId,
          assignedAt: new Date(),
          status: 'active',
        },
      });
    },
    async unassignCounter(counterId, salesAgentId) {
      const assignment = await prisma.counterAssignment.findFirst({
        where: { counterId, salesAgentId, status: 'active', unassignedAt: null },
        orderBy: { id: 'desc' },
      });
      return assignment ? prisma.counterAssignment.update({
        where: { id: assignment.id },
        data: { status: 'inactive', unassignedAt: new Date() },
      }) : null;
    },
    async findBranchQueueStatus(branchCode, operatingDate) {
      const queueDay = await prisma.branchQueueDay.findUnique({
        where: { branchCode_operatingDate: { branchCode, operatingDate } },
      });
      return queueDay;
    },
    async setBranchQueueStatus(branchCode, operatingDate, status) {
      return prisma.branchQueueDay.upsert({
        where: { branchCode_operatingDate: { branchCode, operatingDate } },
        create: { branchCode, operatingDate, status },
        update: { status },
      });
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
    async transitionQueueStatus(ticketNumber, status, staff) {
      return prisma.$transaction(async (transaction) => {
        const existing = await transaction.queueEntry.findFirst({ where: { ticketNumber }, include: { branch: true } });
        const entry = await transaction.queueEntry.update({
          where: { id: existing.id },
          data: { status },
          include: { branch: true },
        });
        if (status === 'serving') {
          await transaction.queueHandling.create({
            data: {
              queueId: entry.id,
              salesAgentId: staff.agentId,
              counterId: staff.counterId,
              startTime: new Date(),
              status: 'serving',
            },
          });
        } else {
          const handling = await transaction.queueHandling.findFirst({
            where: { queueId: entry.id, status: 'serving' },
            orderBy: { id: 'desc' },
          });
          if (handling) {
            await transaction.queueHandling.update({
              where: { id: handling.id },
              data: { endTime: new Date(), status },
            });
          }
        }
        return toQueueEntry(entry);
      });
    },
    async hasActiveQueueHandling(queueId) {
      return Boolean(await prisma.queueHandling.findFirst({ where: { queueId, status: 'serving' }, select: { id: true } }));
    },
    async hasActiveCounterHandling(counterId) {
      return Boolean(await prisma.queueHandling.findFirst({ where: { counterId, status: 'serving' }, select: { id: true } }));
    },
    async createQueueEntry(input) {
      const entry = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.dailySequence.findUnique({
          where: {
            operatingDate_branchCode_serviceType: {
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
            queueDate: input.queueDate,
            ticketNumber: `${input.serviceType}-${String(nextNumber).padStart(3, '0')}`,
            branch: { connect: { code: input.branch.code } },
            name: input.name,
            phoneNumber: input.phoneNumber,
            serviceType: input.serviceType,
            service: { connect: { id: input.service.id } },
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

function toSalesAgent(agent) {
  return {
    id: agent.id,
    employeeId: agent.employeeId,
    agentName: agent.agentName,
    status: agent.status,
    branchCode: agent.branch.code,
    createdAt: agent.createdAt,
    updatedAt: agent.updatedAt,
  };
}

module.exports = { createPrismaRepository };
