function createCounterController(counterService) {
  return {
    list: async (req, res) => respond(res, await counterService.list(req.query.branchCode, req.staff)),
    create: async (req, res) => respond(res, await counterService.create(req.body, req.staff), 201),
    assign: async (req, res) => respond(res, await counterService.assign(Number(req.params.counterId), req.body.salesAgentId, req.staff)),
    unassign: async (req, res) => respond(res, await counterService.unassign(Number(req.params.counterId), req.body.salesAgentId, req.staff)),
  };
}

function respond(res, result, successStatus = 200) {
  if (result.error) return res.status(result.forbidden ? 403 : 400).json({ error: result.error });
  const body = result.counters || result.counter || result.assignment;
  return res.status(successStatus).json(body);
}

module.exports = { createCounterController };