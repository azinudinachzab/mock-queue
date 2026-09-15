function createSalesAgentController(service) {
  return {
    list: async (req, res) => respond(res, await service.list(req.query.branchCode, req.staff), 'agents'),
    find: async (req, res) => respond(res, await service.find(Number(req.params.agentId), req.staff), 'agent'),
    create: async (req, res) => respond(res, await service.create(req.body, req.staff), 'agent', 201),
    update: async (req, res) => respond(res, await service.update(Number(req.params.agentId), req.body, req.staff), 'agent'),
    remove: async (req, res) => respond(res, await service.remove(Number(req.params.agentId), req.staff), 'agent'),
  };
}

function respond(res, result, key, successStatus = 200) {
  if (result.error) return res.status(result.notFound ? 404 : result.forbidden ? 403 : 400).json({ error: result.error });
  return res.status(successStatus).json(result[key]);
}

module.exports = { createSalesAgentController };
