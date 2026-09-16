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
    async listCounters(branchCode, agentId) {
      const counters = await prisma.counter.findMany({
        where: { branch: { code: branchCode } },
        include: {
          serviceMappings: { include: { service: true } },
          assignments: { where: { status: 'active', unassignedAt: null } },
          queueHandlings: { where: { status: 'serving' }, select: { id: true } },
        },
        orderBy: { id: 'asc' },
      });
      return counters.map((counter) => ({
        ...toCounter(counter),
        availableForAgent: (!agentId || !counter.assignments.some((assignment) => assignment.salesAgentId !== agentId))
          && counter.queueHandlings.length === 0,
        ...(agentId ? { availability: 'available' } : {}),
      }));
    },
    async findCounter(counterId) {
      const counter = await prisma.counter.findUnique({
        where: { id: counterId },
        include: { branch: true, serviceMappings: { include: { service: true } } },
      });
      return counter ? toCounter(counter) : null;
    },
    async findCounterByCode(counterCode) {
      return prisma.counter.findUnique({ where: { counterCode } });
    },
    async createCounter(input) {
      return prisma.counter.create({
        data: {
          counterCode: input.counterCode,
          counterName: input.counterName,
          status: input.status || 'active',
          counterType: input.counterType || 'regular',
          branch: { connect: { code: input.branchCode } },
        },
      });
    },
    async updateCounter(counterId, input) {
      const data = {};
      for (const field of ['counterCode', 'counterName', 'status', 'counterType']) {
        if (input[field] !== undefined) data[field] = input[field];
      }
      return prisma.counter.update({ where: { id: counterId }, data });
    },
    async listServices() {
      return prisma.service.findMany({ where: { status: 'active' }, orderBy: { id: 'asc' } });
    },
    async listCounterServiceTypes(counterId) {
      const mappings = await prisma.counterServiceMapping.findMany({
        where: { counterId }, include: { service: true }, orderBy: { serviceId: 'asc' },
      });
      return mappings.map((mapping) => mapping.service.code);
    },
    async updateCounterServiceTypes(counterId, serviceTypes) {
      return prisma.$transaction(async (transaction) => {
        await transaction.counterServiceMapping.deleteMany({ where: { counterId } });
        const services = await transaction.service.findMany({ where: { code: { in: serviceTypes } } });
        if (services.length) {
          await transaction.counterServiceMapping.createMany({
            data: services.map((service) => ({ counterId, serviceId: service.id })),
          });
        }
        return serviceTypes;
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
    async selectCounter(counterId, agentId, branchCode) {
      return prisma.$transaction(async (transaction) => {
        const counter = await transaction.counter.findFirst({
          where: { id: counterId, status: 'active', branch: { code: branchCode } },
          include: {
            branch: true,
            serviceMappings: { include: { service: true } },
            assignments: { where: { status: 'active', unassignedAt: null } },
            queueHandlings: { where: { status: 'serving' }, select: { id: true } },
          },
        });
        if (!counter || counter.assignments.some((assignment) => assignment.salesAgentId !== agentId)) return null;
        if (counter.queueHandlings.length) return null;
        const existing = counter.assignments.find((assignment) => assignment.salesAgentId === agentId);
        if (!existing) {
          await transaction.counterAssignment.create({
            data: { counterId, salesAgentId: agentId, assignedAt: new Date(), status: 'active' },
          });
        }
        return { ...toCounter(counter), availability: 'occupied', assignedAgentId: agentId };
      }, { isolationLevel: 'Serializable' });
    },
    async releaseCounter(counterId, agentId, branchCode) {
      return prisma.$transaction(async (transaction) => {
        const handling = await transaction.queueHandling.findFirst({
          where: { counterId, status: 'serving' }, select: { id: true },
        });
        if (handling) return null;
        const assignment = await transaction.counterAssignment.findFirst({
          where: {
            counterId,
            salesAgentId: agentId,
            status: 'active',
            unassignedAt: null,
            counter: { branch: { code: branchCode } },
          },
          orderBy: { id: 'desc' },
        });
        if (!assignment) return null;
        await transaction.counterAssignment.update({
          where: { id: assignment.id },
          data: { status: 'inactive', unassignedAt: new Date() },
        });
        const counter = await transaction.counter.findUnique({
          where: { id: counterId },
          include: { branch: true, serviceMappings: { include: { service: true } } },
        });
        return counter ? { ...toCounter(counter), availability: 'available' } : null;
      }, { isolationLevel: 'Serializable' });
    },
    async findBranchQueueStatus(branchCode, operatingDate) {
      const queueDay = await prisma.branchQueueDay.findUnique({
        where: { branchCode_operatingDate: { branchCode, operatingDate: operatingDateDate(operatingDate) } },
      });
      return queueDay;
    },
    async setBranchQueueStatus(branchCode, operatingDate, status) {
      return prisma.branchQueueDay.upsert({
        where: { branchCode_operatingDate: { branchCode, operatingDate: operatingDateDate(operatingDate) } },
        create: { branchCode, operatingDate: operatingDateDate(operatingDate), status },
        update: { status },
      });
    },
    async startQueueDay(branchCode, operatingDate, startedAt) {
      return prisma.branchQueueDay.upsert({
        where: { branchCode_operatingDate: { branchCode, operatingDate: operatingDateDate(operatingDate) } },
        create: { branchCode, operatingDate: operatingDateDate(operatingDate), status: 'open', startedAt },
        update: { status: 'open', startedAt },
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
    async getQueueDashboard(branchCode, operatingDate, counterId) {
      const [queueDay, entries, handling, branch] = await Promise.all([
        this.findBranchQueueStatus(branchCode, operatingDate),
        prisma.queueEntry.findMany({
          where: { branchCode, queueDate: new Date(`${operatingDate.slice(0, 4)}-${operatingDate.slice(4, 6)}-${operatingDate.slice(6, 8)}T00:00:00.000Z`) },
          include: { branch: true, service: true },
          orderBy: { id: 'asc' },
        }),
        prisma.queueHandling.findFirst({
          where: { counterId, status: 'serving', queue: { branchCode } },
          include: { queue: true },
          orderBy: { id: 'desc' },
        }),
        this.findBranchByCode(branchCode),
      ]);
      const counter = await this.findCounter(counterId);
      const pending = entries.filter((entry) => entry.status === 'pending');
      const mapped = pending.filter((entry) => counter.serviceTypes.includes(entry.serviceType));
      const priority = mapped.filter((entry) => entry.service.queueType === 'priority');
      const regular = mapped.filter((entry) => entry.service.queueType === 'regular');
      const fallbackPriority = [];
      for (const entry of priority) {
        if (!await this.hasAvailablePriorityCounter(branchCode, entry.serviceType)) fallbackPriority.push(entry);
      }
      const next = counter.counterType === 'priority'
        ? (priority[0] || regular[0] || null)
        : (regular[0] || fallbackPriority[0] || null);
      const availableCounterCount = await this.countAvailableCounters(branchCode);
      return {
        branch: toBranch(branch),
        queueDay,
        counterId,
        waitingCount: pending.length,
        currentQueue: pending.length,
        availableCounterCount,
        currentTicket: handling ? handling.queue.ticketNumber : 0,
        nextTicket: next ? next.ticketNumber : 0,
      };
    },
    async countAvailableCounters(branchCode) {
      return prisma.counter.count({
        where: {
          status: 'active',
          branch: { code: branchCode },
          assignments: { none: { status: 'active', unassignedAt: null } },
          queueHandlings: { none: { status: 'serving' } },
        },
      });
    },
    async findQueueByTicket(ticketNumber, branchCode) {
      const entry = await prisma.queueEntry.findFirst({
        where: { ticketNumber, ...(branchCode ? { branchCode } : {}) },
        include: { branch: true, service: true },
      });
      return entry ? toQueueEntry(entry) : null;
    },
    async findQueueByPhoneAndDate(phoneNumber, operatingDate) {
      const entry = await prisma.queueEntry.findFirst({
        where: {
          phoneNumber,
          queueDate: new Date(`${operatingDate.slice(0, 4)}-${operatingDate.slice(4, 6)}-${operatingDate.slice(6, 8)}T00:00:00.000Z`),
          status: { not: 'completed' },
        },
        include: { branch: true },
        orderBy: { id: 'asc' },
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
    async isQueueEligibleForCounter(entry, counterId) {
      const counter = await this.findCounter(counterId);
      if (!counter || counter.status !== 'active') return false;
      return counter.serviceTypes.includes(entry.serviceType)
        && (counter.counterType === 'priority'
          || entry.service.queueType === 'regular'
          || !(await this.hasAvailablePriorityCounter(entry.branch.code, entry.serviceType)));
    },
    async hasAvailablePriorityCounter(branchCode, serviceType) {
      const serviceTypes = Array.isArray(serviceType) ? serviceType : [serviceType];
      const counter = await prisma.counter.findFirst({
        where: {
          status: 'active',
          counterType: 'priority',
          branch: { code: branchCode },
          serviceMappings: { some: { service: { code: { in: serviceTypes } } } },
          assignments: { none: { status: 'active', unassignedAt: null } },
          queueHandlings: { none: { status: 'serving' } },
        },
        select: { id: true },
      });
      return Boolean(counter);
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
    async recallQueue(ticketNumber, staff) {
      return prisma.$transaction(async (transaction) => {
        const existing = await transaction.queueEntry.findFirst({ where: { ticketNumber }, include: { branch: true } });
        const handling = await transaction.queueHandling.findFirst({
          where: { queueId: existing.id, status: 'serving' },
          orderBy: { id: 'desc' },
        });
        if (handling) {
          await transaction.queueHandling.update({
            where: { id: handling.id },
            data: { endTime: new Date(), status: 'recalled' },
          });
        }
        await transaction.queueHandling.create({
          data: {
            queueId: existing.id,
            salesAgentId: staff.agentId,
            counterId: staff.counterId,
            startTime: new Date(),
            status: 'serving',
          },
        });
        const entry = await transaction.queueEntry.update({
          where: { id: existing.id },
          data: { status: 'serving' },
          include: { branch: true },
        });
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
              operatingDate: operatingDateDate(input.operatingDate),
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
              operatingDate: operatingDateDate(input.operatingDate),
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

function operatingDateDate(operatingDate) {
  return new Date(`${operatingDate.slice(0, 4)}-${operatingDate.slice(4, 6)}-${operatingDate.slice(6, 8)}T00:00:00.000Z`);
}

function toQueueEntry(entry) {
  const { branch, ...queueEntry } = entry;
  return { ...queueEntry, branch: toBranch(branch) };
}

function toCounter(counter) {
  const { branch, serviceMappings, ...value } = counter;
  return {
    ...value,
    ...(branch ? { branchCode: branch.code } : {}),
    serviceTypes: (serviceMappings || []).map((mapping) => mapping.service.code),
  };
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
