function createSalesAgentService(repository) {
  return {
    async list(branchCode, staff) {
      const scope = await repository.getStaffBranch(staff.agentId, branchCode);
      if (scope.error) return scope;
      return { agents: await repository.listSalesAgents(scope.branchCode) };
    },
    async find(id, staff) {
      const agent = await repository.findSalesAgent(id);
      if (!agent) return { error: 'Sales agent not found', notFound: true };
      const scope = await repository.getStaffBranch(staff.agentId, agent.branchCode);
      if (scope.error) return scope;
      return { agent };
    },
    async create(input, staff) {
      if (!input.branchCode || !input.employeeId || !input.agentName) {
        return { error: 'branchCode, employeeId, and agentName are required' };
      }
      const scope = await repository.getStaffBranch(staff.agentId, input.branchCode);
      if (scope.error) return scope;
      return { agent: await repository.createSalesAgent(input) };
    },
    async update(id, input, staff) {
      const agent = await repository.findSalesAgent(id);
      if (!agent) return { error: 'Sales agent not found', notFound: true };
      const scope = await repository.getStaffBranch(staff.agentId, agent.branchCode);
      if (scope.error) return scope;
      return { agent: await repository.updateSalesAgent(id, input) };
    },
    async remove(id, staff) {
      const agent = await repository.findSalesAgent(id);
      if (!agent) return { error: 'Sales agent not found', notFound: true };
      const scope = await repository.getStaffBranch(staff.agentId, agent.branchCode);
      if (scope.error) return scope;
      return { agent: await repository.updateSalesAgent(id, { status: 'inactive' }) };
    },
  };
}

module.exports = { createSalesAgentService };
