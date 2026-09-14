const express = require('express');

function createCounterRoutes(controller) {
  const router = express.Router();
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.post('/:counterId/assignment', controller.assign);
  router.delete('/:counterId/assignment', controller.unassign);
  return router;
}

module.exports = { createCounterRoutes };