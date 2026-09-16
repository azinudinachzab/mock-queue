function createCounterService(repository, now = () => new Date()) {
  return {
    async available(staff) {
      const queueDay = await repository.findBranchQueueStatus(staff.branchCode, now().toISOString().slice(0, 10).replaceAll('-', ''));
      if (!queueDay || queueDay.status !== 'open') return { error: 'Queue is not open for this branch and date', conflict: true };
      const counters = await repository.listCounters(staff.branchCode, staff.agentId);
      return { counters: counters.filter((counter) => counter.status === 'active' && counter.availableForAgent) };
    },
    async select(counterId, staff) {
      const queueDay = await repository.findBranchQueueStatus(staff.branchCode, now().toISOString().slice(0, 10).replaceAll('-', ''));
      if (!queueDay || queueDay.status !== 'open') return { error: 'Queue is not open for this branch and date', conflict: true };
      const counter = await repository.selectCounter(counterId, staff.agentId, staff.branchCode);
      if (!counter) return { error: 'Counter is not available for selection', forbidden: true };
      return { counter };
    },
    async release(counterId, staff) {
      const released = await repository.releaseCounter(counterId, staff.agentId, staff.branchCode);
      if (!released) return { error: 'Counter is not assigned to this internal', forbidden: true };
      return { counter: released };
    },
    async endSession(counterId, staff) {
      const released = await repository.releaseCounter(counterId, staff.agentId, staff.branchCode);
      if (!released) return { error: 'Counter session is not owned by this internal', forbidden: true };
      return { counter: released };
    },
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
      if (input.counterType !== undefined && !['priority', 'regular'].includes(input.counterType)) {
        return { error: 'counterType must be priority or regular' };
      }
      const staffBranch = await repository.findStaffBranch(staff.agentId);
      if (!staffBranch || staffBranch.code !== input.branchCode) {
        return { error: 'Staff agent is not assigned to this branch', forbidden: true };
      }
      if (await repository.findCounterByCode(input.counterCode)) {
        return { error: 'counterCode must be unique', conflict: true };
      }
      const serviceTypes = await resolveServiceTypes(repository, input.serviceTypes);
      if (serviceTypes.error) return serviceTypes;
      const counter = await repository.createCounter({ ...input, serviceTypes: serviceTypes.values });
      await repository.updateCounterServiceTypes(counter.id, serviceTypes.values);
      return { counter: { ...counter, serviceTypes: serviceTypes.values } };
    },
    async update(counterId, input, staff) {
      const counter = await repository.findCounter(counterId);
      const staffBranch = await repository.findStaffBranch(staff.agentId);
      if (!counter) return { error: 'Counter not found', notFound: true };
      if (!staffBranch || counter.branchCode !== staffBranch.code) {
        return { error: 'Counter is not in the staff branch', forbidden: true };
      }
      if (input.counterCode !== undefined && (!input.counterCode || typeof input.counterCode !== 'string')) {
        return { error: 'counterCode must be a non-empty string' };
      }
      if (input.counterCode !== undefined) {
        const duplicate = await repository.findCounterByCode(input.counterCode);
        if (duplicate && duplicate.id !== counterId) return { error: 'counterCode must be unique', conflict: true };
      }
      if (input.counterName !== undefined && (!input.counterName || typeof input.counterName !== 'string')) {
        return { error: 'counterName must be a non-empty string' };
      }
      if (input.status !== undefined && !['active', 'inactive'].includes(input.status)) {
        return { error: 'status must be active or inactive' };
      }
      if (input.counterType !== undefined && !['priority', 'regular'].includes(input.counterType)) {
        return { error: 'counterType must be priority or regular' };
      }
      const serviceTypes = input.serviceTypes === undefined
        ? null
        : await resolveServiceTypes(repository, input.serviceTypes);
      if (serviceTypes && serviceTypes.error) return serviceTypes;
      const counterInput = serviceTypes ? { ...input, serviceTypes: serviceTypes.values } : input;
      const updated = await repository.updateCounter(counterId, counterInput);
      if (serviceTypes) await repository.updateCounterServiceTypes(counterId, serviceTypes.values);
      return { counter: { ...updated, serviceTypes: await repository.listCounterServiceTypes(counterId) } };
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

async function resolveServiceTypes(repository, input) {
  if (input === undefined) return { values: (await repository.listServices()).map((service) => service.code) };
  if (!Array.isArray(input) || input.length === 0 || input.some((serviceType) => typeof serviceType !== 'string')) {
    return { error: 'serviceTypes must contain one or more service codes' };
  }
  const values = [...new Set(input)];
  for (const serviceType of values) {
    const service = await repository.findServiceByCode(serviceType);
    if (!service || service.status !== 'active') return { error: `Invalid or inactive serviceType: ${serviceType}` };
  }
  return { values };
}

module.exports = { createCounterService };