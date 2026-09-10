const branches = require('../data/branches');

function createMemoryRepository() {
  const queue = [];
  const sequences = new Map();

  return {
    queue,
    async findBranchByCode(code) {
      return branches.find((branch) => branch.code === code) || null;
    },
    async listQueue(status) {
      return status ? queue.filter((entry) => entry.status === status) : [...queue];
    },
    async findQueueByTicket(ticketNumber) {
      return queue.find((entry) => entry.ticketNumber === ticketNumber) || null;
    },
    async createQueueEntry(input) {
      const sequenceKey = `${input.operatingDate}:${input.serviceType}`;
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
