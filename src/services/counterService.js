function createCounterService(repository) {
  return {
    async list(branchCode, staff) {
      const staffBranch = await repository.findStaffBranch(staff.agentId);
      if (!staffBranch || (branchCode && branchCode !== staffBranch.code)) {
        return { error: 'Staff agent is not assigned to this branch', forbidden: true };
      }
      return { counters: await repository.listCounters(branchCode || staffBranch.code) };
    },
    async create(input, staff) {
      if (!input.branchCode || !input.counterCode || !input.counterName) {
        return { error: 'branchCode, counterCode, and counterName are required' };
      }
      const staffBranch = await repository.findStaffBranch(staff.agentId);
      if (!staffBranch || staffBranch.code !== input.branchCode) {
        return { error: 'Staff agent is not assigned to this branch', forbidden: true };
      }
      return { counter: await repository.createCounter(input) };
    },
    async assign(counterId, salesAgentId, staff) {
      if (!Number.isInteger(salesAgentId) || salesAgentId < 1) return { error: 'salesAgentId is required' };
      const staffBranch = await repository.findStaffBranch(staff.agentId);
      const counter = await repository.findCounter(counterId);
      const agent = await repository.findStaffBranch(salesAgentId);
      if (!counter || !agent || !staffBranch || counter.branchCode !== staffBranch.code || agent.code !== counter.branchCode) {
        return { error: 'Counter and sales agent must belong to the staff branch', forbidden: true };
      }
      return { assignment: await repository.assignCounter(counterId, salesAgentId) };
    },
    async unassign(counterId, salesAgentId, staff) {
      const staffBranch = await repository.findStaffBranch(staff.agentId);
      const counter = await repository.findCounter(counterId);
      if (!counter || !staffBranch || counter.branchCode !== staffBranch.code) {
        return { error: 'Counter is not in the staff branch', forbidden: true };
      }
      return { assignment: await repository.unassignCounter(counterId, salesAgentId || staff.agentId) };
    },
  };
}

module.exports = { createCounterService };