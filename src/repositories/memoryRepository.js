const branches = require('../data/branches');
const services = require('../data/services').map((service, index) => ({ id: index + 1, ...service }));
const seededAgents = require('../data/salesAgents');
const seededCounters = require('../data/counters');

function createMemoryRepository() {
  const queue = [];
  const sequences = new Map();
  const queueHandling = [];
  const branchQueueStatuses = new Map();
  const agents = seededAgents.map((agent, index) => ({ id: index + 1, ...agent, code: agent.branchCode }));
  const counters = seededCounters.map((counter, index) => ({ id: index + 1, counterType: 'regular', ...counter }));
  const counterServiceMappings = counters.flatMap((counter) => services.map((service) => ({
    counterId: counter.id,
    serviceType: service.code,
  })));
  const assignments = counters.map((counter, index) => ({
    id: index + 1,
    agentId: index + 1,
    counterId: counter.id,
    branchCode: counter.branchCode,
    status: 'active',
  }));

  return {
    queue,
    queueHandling,
    branchQueueStatuses,
    services,
    counters,
    assignments,
      counterServiceMappings,
    async getStaffBranch(agentId, branchCode) {
      const agent = agents.find((item) => item.id === agentId && item.status === 'active');
      if (!agent) return { error: 'Staff agent is not active', forbidden: true };
      if (branchCode && agent.code !== branchCode) return { error: 'Staff agent is not assigned to this branch', forbidden: true };
      return { branchCode: agent.code };
    },
    async listSalesAgents(branchCode) {
      return agents.filter((agent) => agent.code === branchCode);
    },
    async findSalesAgent(id) {
      const agent = agents.find((item) => item.id === id);
      return agent ? { ...agent, branchCode: agent.code } : null;
    },
    async createSalesAgent(input) {
      const agent = { id: agents.length + 1, ...input, code: input.branchCode };
      agents.push(agent);
      return agent;
    },
    async updateSalesAgent(id, input) {
      const agent = agents.find((item) => item.id === id);
      Object.assign(agent, input);
      if (input.branchCode) agent.code = input.branchCode;
      return agent;
    },
    async findStaffBranch(agentId) {
      return agents.find((agent) => agent.id === agentId && agent.status === 'active') || null;
    },
    async listCounters(branchCode, agentId) {
      return Promise.all(counters.filter((counter) => counter.branchCode === branchCode)
        .map(async (counter) => ({
          ...counter,
          serviceTypes: await this.listCounterServiceTypes(counter.id),
          availableForAgent: !agentId || !assignments.some((assignment) => assignment.counterId === counter.id
            && assignment.status === 'active' && assignment.agentId !== agentId)
            && !queueHandling.some((handling) => handling.counterId === counter.id && handling.status === 'serving'),
          ...(agentId ? { availability: 'available' } : {}),
        })));
    },
    async findCounter(counterId) {
      const counter = counters.find((item) => item.id === counterId);
      return counter ? {
        ...counter, serviceTypes: await this.listCounterServiceTypes(counterId), availableForAgent: true,
      } : null;
    },
    async findCounterByCode(counterCode) {
      return counters.find((counter) => counter.counterCode === counterCode) || null;
    },
    async createCounter(input) {
      const counter = {
        id: counters.length + 1,
        branchCode: input.branchCode,
        counterCode: input.counterCode,
        counterName: input.counterName,
        status: input.status || 'active',
        counterType: input.counterType || 'regular',
      };
      counters.push(counter);
      return counter;
    },
    async updateCounter(counterId, input) {
      const counter = counters.find((item) => item.id === counterId);
      Object.assign(counter, {
        ...(input.counterCode !== undefined ? { counterCode: input.counterCode } : {}),
        ...(input.counterName !== undefined ? { counterName: input.counterName } : {}),
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(input.counterType !== undefined ? { counterType: input.counterType } : {}),
      });
      return counter;
    },
    async assignCounter(counterId, salesAgentId) {
      const counter = counters.find((item) => item.id === counterId);
      const assignment = { id: assignments.length + 1, counterId, agentId: salesAgentId, branchCode: counter.branchCode, status: 'active' };
      assignments.push(assignment);
      return assignment;
    },
    async unassignCounter(counterId, salesAgentId) {
      const assignment = [...assignments].reverse().find((item) => item.counterId === counterId
        && item.agentId === salesAgentId && item.status === 'active');
      if (assignment) assignment.status = 'inactive';
      return assignment || null;
    },
    async selectCounter(counterId, agentId, branchCode) {
      const counter = counters.find((item) => item.id === counterId && item.branchCode === branchCode && item.status === 'active');
      if (!counter) return null;
      if (queueHandling.some((handling) => handling.counterId === counterId && handling.status === 'serving')) return null;
      const occupied = assignments.find((assignment) => assignment.counterId === counterId
        && assignment.status === 'active' && assignment.agentId !== agentId);
      if (occupied) return null;
      let assignment = assignments.find((item) => item.counterId === counterId && item.agentId === agentId && item.status === 'active');
      if (!assignment) {
        assignment = { id: assignments.length + 1, counterId, agentId, branchCode, status: 'active' };
        assignments.push(assignment);
      }
      return { ...(await this.findCounter(counterId)), availability: 'occupied', assignedAgentId: agentId };
    },
    async releaseCounter(counterId, agentId, branchCode) {
      if (queueHandling.some((handling) => handling.counterId === counterId && handling.status === 'serving')) return null;
      const assignment = [...assignments].reverse().find((item) => item.counterId === counterId
        && item.agentId === agentId && item.branchCode === branchCode && item.status === 'active');
      if (!assignment) return null;
      assignment.status = 'inactive';
      return { ...(await this.findCounter(counterId)), availability: 'available' };
    },
    async findServiceByCode(code) {
      return services.find((service) => service.code === code) || null;
    },
    async listServices() {
      return services.filter((service) => service.status === 'active');
    },
    async listCounterServiceTypes(counterId) {
      return counterServiceMappings
        .filter((mapping) => mapping.counterId === counterId)
        .map((mapping) => mapping.serviceType);
    },
    async updateCounterServiceTypes(counterId, serviceTypes) {
      for (let index = counterServiceMappings.length - 1; index >= 0; index -= 1) {
        if (counterServiceMappings[index].counterId === counterId) counterServiceMappings.splice(index, 1);
      }
      serviceTypes.forEach((serviceType) => counterServiceMappings.push({ counterId, serviceType }));
      return serviceTypes;
    },
    async findBranchQueueStatus(branchCode, operatingDate) {
      const status = branchQueueStatuses.get(`${branchCode}:${operatingDate}`);
      if (!status) return null;
      return typeof status === 'string' ? { branchCode, operatingDate, status } : status;
    },
    async setBranchQueueStatus(branchCode, operatingDate, status) {
      const existing = branchQueueStatuses.get(`${branchCode}:${operatingDate}`);
      const queueDay = {
        branchCode,
        operatingDate,
        status,
        startedAt: existing && typeof existing === 'object' ? existing.startedAt : null,
      };
      branchQueueStatuses.set(`${branchCode}:${operatingDate}`, queueDay);
      return queueDay;
    },
    async startQueueDay(branchCode, operatingDate, startedAt) {
      const queueDay = { branchCode, operatingDate, status: 'open', startedAt };
      branchQueueStatuses.set(`${branchCode}:${operatingDate}`, queueDay);
      return queueDay;
    },
    async findBranchByCode(code) {
      return branches.find((branch) => branch.code === code) || null;
    },
    async listQueue(status) {
      return status ? queue.filter((entry) => entry.status === status) : [...queue];
    },
    async getQueueDashboard(branchCode, operatingDate, counterId) {
      const queueDay = await this.findBranchQueueStatus(branchCode, operatingDate);
      const entries = queue.filter((entry) => entry.branch.code === branchCode
        && entry.queueDate.slice(0, 10).replaceAll('-', '') === operatingDate);
      const handling = queueHandling.find((item) => item.counterId === counterId && item.status === 'serving');
      const current = handling ? queue.find((entry) => entry.id === handling.queueId) : null;
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
        branch: await this.findBranchByCode(branchCode),
        queueDay,
        counterId,
        waitingCount: pending.length,
        currentQueue: pending.length,
        availableCounterCount,
        currentTicket: current ? current.ticketNumber : 0,
        nextTicket: next ? next.ticketNumber : 0,
      };
    },
    async countAvailableCounters(branchCode) {
      return counters.filter((counter) => counter.branchCode === branchCode
        && counter.status === 'active'
        && !assignments.some((assignment) => assignment.counterId === counter.id && assignment.status === 'active')
        && !queueHandling.some((handling) => handling.counterId === counter.id && handling.status === 'serving')).length;
    },
    async findQueueByTicket(ticketNumber, branchCode) {
      return queue.find((entry) => entry.ticketNumber === ticketNumber && (!branchCode || entry.branch.code === branchCode)) || null;
    },
    async findQueueByPhoneAndDate(phoneNumber, operatingDate) {
      return queue.find((entry) => entry.phoneNumber === phoneNumber
        && entry.queueDate.slice(0, 10).replaceAll('-', '') === operatingDate
        && entry.status !== 'completed') || null;
    },
    async updateQueueStatus(ticketNumber, status) {
      const entry = queue.find((item) => item.ticketNumber === ticketNumber);
      entry.status = status;
      return entry;
    },
    async findActiveStaffAssignment(staff, branchCode) {
      return assignments.find((assignment) => assignment.agentId === staff.agentId
        && assignment.counterId === staff.counterId
        && assignment.branchCode === branchCode
        && assignment.status === 'active') || null;
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
      return counters.some((counter) => counter.branchCode === branchCode
        && counter.status === 'active'
        && counter.counterType === 'priority'
        && counterServiceMappings.some((mapping) => mapping.counterId === counter.id && serviceTypes.includes(mapping.serviceType))
        && !assignments.some((assignment) => assignment.counterId === counter.id && assignment.status === 'active')
        && !queueHandling.some((handling) => handling.counterId === counter.id && handling.status === 'serving'));
    },
    async hasActiveQueueHandling(queueId) {
      return queueHandling.some((handling) => handling.queueId === queueId && handling.status === 'serving');
    },
    async hasActiveCounterHandling(counterId) {
      return queueHandling.some((handling) => handling.counterId === counterId && handling.status === 'serving');
    },
    async createQueueHandling(entry, staff) {
      const handling = {
        id: queueHandling.length + 1,
        queueId: entry.id,
        salesAgentId: staff.agentId,
        counterId: staff.counterId,
        startTime: new Date().toISOString(),
        endTime: null,
        status: 'serving',
      };
      queueHandling.push(handling);
      return handling;
    },
    async closeQueueHandling(queueId, status) {
      const handling = [...queueHandling].reverse().find((item) => item.queueId === queueId && item.status === 'serving');
      if (handling) {
        handling.endTime = new Date().toISOString();
        handling.status = status;
      }
      return handling || null;
    },
    async transitionQueueStatus(ticketNumber, status, staff) {
      const entry = queue.find((item) => item.ticketNumber === ticketNumber);
      entry.status = status;
      if (status === 'serving') await this.createQueueHandling(entry, staff);
      else await this.closeQueueHandling(entry.id, status);
      return entry;
    },
    async recallQueue(ticketNumber, staff) {
      const entry = queue.find((item) => item.ticketNumber === ticketNumber);
      await this.closeQueueHandling(entry.id, 'recalled');
      await this.createQueueHandling(entry, staff);
      entry.updatedAt = new Date().toISOString();
      return entry;
    },
    async createQueueEntry(input) {
      const sequenceKey = `${input.branch.code}:${input.operatingDate}:${input.serviceType}`;
      const nextNumber = (sequences.get(sequenceKey) || 0) + 1;
      sequences.set(sequenceKey, nextNumber);
      const entry = {
        id: queue.length + 1,
        queueDate: input.queueDate.toISOString(),
        ticketNumber: `${input.serviceType}-${String(nextNumber).padStart(3, '0')}`,
        branch: input.branch,
        name: input.name,
        phoneNumber: input.phoneNumber,
        serviceType: input.serviceType,
        service: input.service,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      queue.push(entry);
      return entry;
    },
  };
}

module.exports = { createMemoryRepository };
