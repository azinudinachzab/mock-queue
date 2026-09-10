function createQueueController(queueService) {
  return {
    list: async (req, res) => {
      const result = await queueService.list(req.query.status);
      if (result.error) return res.status(400).json({ error: result.error });
      return res.json(result.entries);
    },
    findByTicket: async (req, res) => {
      const entry = await queueService.findByTicket(req.params.ticketNumber);
      if (!entry) return res.status(404).json({ error: 'Ticket not found' });
      return res.json(entry);
    },
    create: async (req, res) => {
      const result = await queueService.create(req.body);
      if (result.error) return res.status(400).json({ error: result.error });
      return res.status(201).json(result.entry);
    },
  };
}

module.exports = { createQueueController };
