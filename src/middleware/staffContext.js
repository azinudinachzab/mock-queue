function requireStaffContext(req, res, next) {
  const agentId = Number(req.get('x-staff-agent-id'));
  const counterId = Number(req.get('x-staff-counter-id'));

  if (!Number.isInteger(agentId) || agentId < 1 || !Number.isInteger(counterId) || counterId < 1) {
    return res.status(401).json({ error: 'X-Staff-Agent-Id and X-Staff-Counter-Id are required' });
  }

  req.staff = { agentId, counterId };
  return next();
}

module.exports = { requireStaffContext };