const express = require('express');

function createSalesAgentRoutes(controller) {
  const router = express.Router();
  router.get('/', controller.list);
  router.get('/:agentId', controller.find);
  router.post('/', controller.create);
  router.patch('/:agentId', controller.update);
  router.delete('/:agentId', controller.remove);
  return router;
}

module.exports = { createSalesAgentRoutes };
