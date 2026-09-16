function createCounterController(counterService) {
  return {
    available: async (req, res) => respond(res, await counterService.available(req.staff)),
    select: async (req, res) => respond(res, await counterService.select(Number(req.params.counterId), req.staff)),
    release: async (req, res) => respond(res, await counterService.release(Number(req.params.counterId), req.staff)),
    endSession: async (req, res) => respond(res, await counterService.endSession(Number(req.params.counterId), req.staff)),
    list: async (req, res) => respond(res, await counterService.list(req.query.branchCode, req.staff)),
    create: async (req, res) => respond(res, await counterService.create(req.body, req.staff), 201),
    update: async (req, res) => respond(res, await counterService.update(Number(req.params.counterId), req.body, req.staff)),
    assign: async (req, res) => respond(res, await counterService.assign(Number(req.params.counterId), req.body.salesAgentId, req.staff)),
    unassign: async (req, res) => respond(res, await counterService.unassign(Number(req.params.counterId), req.body.salesAgentId, req.staff)),
  };
}

function respond(res, result, successStatus = 200) {
  if (result.error) return res.status(result.notFound ? 404 : result.forbidden ? 403 : result.conflict ? 409 : 400).json({ error: result.error });
  const body = result.counters || result.counter || result.assignment;
  return res.status(successStatus).json(body);
}

module.exports = { createCounterController };