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
    changeTicketStatus: async (req, res) => respondToTransition(
      res,
      await queueService.changeTicketStatus(req.params.ticketNumber, req.body.status, req.staff),
    ),
    recallTicket: async (req, res) => respondToTransition(
      res,
      await queueService.recallTicket(req.params.ticketNumber, req.staff),
    ),
    changeBranchQueueStatus: async (req, res) => {
      const result = await queueService.changeBranchQueueStatus(
        req.params.branchCode,
        req.body.operatingDate,
        req.body.status,
        req.staff,
      );
      if (result.error) return res.status(result.notFound ? 404 : result.forbidden ? 403 : 400).json({ error: result.error });
      return res.json(result.queue);
    },
    startQueueDay: async (req, res) => respondToDashboard(
      res,
      await queueService.startQueueDay(req.staff),
    ),
    dashboard: async (req, res) => respondToDashboard(
      res,
      await queueService.dashboard(req.staff),
    ),
    create: async (req, res) => {
      const result = await queueService.create(req.body);
      if (result.error) return res.status(result.closed || result.duplicate ? 409 : result.queueStatusNotFound ? 503 : 400).json({ error: result.error });
      return res.status(201).json(result.entry);
    },
  };
}

function respondToTransition(res, result) {
  if (result.error) return res.status(result.notFound ? 404 : result.forbidden ? 403 : result.conflict ? 409 : 409).json({ error: result.error });
  return res.json(result.entry);
}

function respondToDashboard(res, result) {
  if (result.error) return res.status(result.forbidden ? 403 : result.notStarted ? 409 : 400).json({ error: result.error });
  return res.json(result.dashboard);
}

module.exports = { createQueueController };
