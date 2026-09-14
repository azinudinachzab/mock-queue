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
  const counters = seededCounters.map((counter, index) => ({ id: index + 1, ...counter }));
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
    async listCounters(branchCode) {
      return counters.filter((counter) => counter.branchCode === branchCode);
    },
    async findCounter(counterId) {
      return counters.find((counter) => counter.id === counterId) || null;
    },
    async createCounter(input) {
      const counter = {
        id: counters.length + 1,
        branchCode: input.branchCode,
        counterCode: input.counterCode,
        counterName: input.counterName,
        status: input.status || 'active',
      };
      counters.push(counter);
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
    async findServiceByCode(code) {
      return services.find((service) => service.code === code) || null;
    },
    async findBranchQueueStatus(branchCode, operatingDate) {
      const status = branchQueueStatuses.get(`${branchCode}:${operatingDate}`);
      return status ? { branchCode, operatingDate, status } : null;
    },
    async setBranchQueueStatus(branchCode, operatingDate, status) {
      branchQueueStatuses.set(`${branchCode}:${operatingDate}`, status);
      return { branchCode, operatingDate, status };
    },
    async findBranchByCode(code) {
      return branches.find((branch) => branch.code === code) || null;
    },
    async listQueue(status) {
      return status ? queue.filter((entry) => entry.status === status) : [...queue];
    },
    async findQueueByTicket(ticketNumber, branchCode) {
      return queue.find((entry) => entry.ticketNumber === ticketNumber && (!branchCode || entry.branch.code === branchCode)) || null;
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
    async createQueueEntry(input) {
      const sequenceKey = `${input.branch.code}:${input.operatingDate}:${input.serviceType}`;
      const nextNumber = (sequences.get(sequenceKey) || 0) + 1;
      sequences.set(sequenceKey, nextNumber);
      const entry = {
        id: queue.length + 1,
        ticketNumber: `${input.serviceType}-${String(nextNumber).padStart(3, '0')}`,
        branch: input.branch,
        name: input.name,
        phoneNumber: input.phoneNumber,
        serviceType: input.serviceType,
        service: input.service,
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      queue.push(entry);
      return entry;
    },
  };
}

module.exports = { createMemoryRepository };
