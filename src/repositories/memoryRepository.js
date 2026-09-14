const branches = require('../data/branches');

function createMemoryRepository() {
  const queue = [];
  const sequences = new Map();
  const queueHandling = [];
  const assignments = [
    { agentId: 1, counterId: 1, branchCode: 'BR-001', status: 'active' },
  ];

  return {
    queue,
    queueHandling,
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
        status: 'pending',
        createdAt: new Date().toISOString(),
      };
      queue.push(entry);
      return entry;
    },
  };
}

module.exports = { createMemoryRepository };
