const express = require('express');

function createCounterRoutes(controller, requireStaffContext, requireStaffAgentContext) {
  const router = express.Router();
  router.get('/available', requireStaffAgentContext, controller.available);
  router.post('/:counterId/select', requireStaffAgentContext, controller.select);
  router.delete('/:counterId/select', requireStaffAgentContext, controller.release);
  router.post('/:counterId/session/end', requireStaffAgentContext, controller.endSession);
  router.use(requireStaffContext);
  router.get('/', controller.list);
  router.post('/', controller.create);
  router.patch('/:counterId', controller.update);
  router.post('/:counterId/assignment', controller.assign);
  router.delete('/:counterId/assignment', controller.unassign);
  return router;
}

module.exports = { createCounterRoutes };