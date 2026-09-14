function createQueueController(queueService) {
  return {
    list: async (req, res) => {
      const result = await queueService.list(req.query.status);
      if (result.error) return res.status(400).json({ error: result.error });
      return res.json(result.entries);
    },
    findByTicket: async (req, res) => {
      const entry = await queueService.findByTicket(req.params.ticketNumber, req.params.branchCode);
      if (!entry) return res.status(404).json({ error: 'Ticket not found' });
      return res.json(entry);
    },
    start: async (req, res) => respondToTransition(res, await queueService.start(req.params.ticketNumber, req.staff)),
    complete: async (req, res) => respondToTransition(res, await queueService.complete(req.params.ticketNumber, req.staff)),
    cancel: async (req, res) => respondToTransition(res, await queueService.cancel(req.params.ticketNumber, req.staff)),
    create: async (req, res) => {
      const result = await queueService.create(req.body);
      if (result.error) return res.status(400).json({ error: result.error });
      return res.status(201).json(result.entry);
    },
  };
}

function respondToTransition(res, result) {
  if (result.error) return res.status(result.notFound ? 404 : result.forbidden ? 403 : 409).json({ error: result.error });
  return res.json(result.entry);
}

module.exports = { createQueueController };
