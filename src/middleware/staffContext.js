function createStaffAgentContext(repository) {
  return async function requireStaffAgentContext(req, res, next) {
    const agentId = Number(req.get('x-staff-agent-id'));
    if (!Number.isInteger(agentId) || agentId < 1) {
      return res.status(401).json({ error: 'X-Staff-Agent-Id is required' });
    }
    const staffBranch = await repository.findStaffBranch(agentId);
    if (!staffBranch) return res.status(403).json({ error: 'Staff agent is not active' });
    req.staff = { agentId, branchCode: staffBranch.code };
    return next();
  };
}

function createStaffContext(repository) {
  return async function requireStaffContext(req, res, next) {
    const agentId = Number(req.get('x-staff-agent-id'));
    const counterId = Number(req.get('x-staff-counter-id'));

    if (!Number.isInteger(agentId) || agentId < 1 || !Number.isInteger(counterId) || counterId < 1) {
      return res.status(401).json({ error: 'X-Staff-Agent-Id and X-Staff-Counter-Id are required' });
    }

    const [staffBranch, counter] = await Promise.all([
      repository.findStaffBranch(agentId),
      repository.findCounter(counterId),
    ]);
    if (!staffBranch) return res.status(403).json({ error: 'Staff agent is not active' });
    if (!counter || counter.status !== 'active' || counter.branchCode !== staffBranch.code) {
      return res.status(403).json({ error: 'Counter is not configured for the staff branch' });
    }

    req.staff = { agentId, counterId, branchCode: staffBranch.code };
    return next();
  };
}

module.exports = { createStaffAgentContext, createStaffContext };