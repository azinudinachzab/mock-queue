const express = require('express');

function createInternalRoutes({
  queueController,
  counterRoutes,
  salesAgentRoutes,
  requireStaffContext,
}) {
  const router = express.Router();
  router.use('/counters', counterRoutes);
  router.use('/sales-agents', requireStaffContext, salesAgentRoutes);
  router.use(requireStaffContext);
  router.get('/queue', queueController.list);
  router.get('/dashboard', queueController.dashboard);
  router.post('/dashboard/start', queueController.startQueueDay);
  router.patch('/branches/:branchCode/queue-status', queueController.changeBranchQueueStatus);
  router.patch('/queue/:ticketNumber/status', queueController.changeTicketStatus);
  router.post('/queue/:ticketNumber/recall', queueController.recallTicket);
  router.get('/queue/:ticketNumber', queueController.findByTicket);
  return router;
}

module.exports = { createInternalRoutes };