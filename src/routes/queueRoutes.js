const express = require('express');

function createQueueRoutes(controller) {
  const router = express.Router();
  router.get('/', controller.list);
  router.get('/:ticketNumber', controller.findByTicket);
  router.post('/', controller.create);
  return router;
}

module.exports = { createQueueRoutes };
