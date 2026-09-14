const express = require('express');
const { requireStaffContext } = require('../middleware/staffContext');

function createInternalRoutes(queueController) {
  const router = express.Router();
  router.use(requireStaffContext);
  router.get('/queue', queueController.list);
  router.patch('/branches/:branchCode/queue-status', queueController.changeBranchQueueStatus);
  router.patch('/queue/:ticketNumber/status', queueController.changeTicketStatus);
  router.get('/queue/:ticketNumber', queueController.findByTicket);
  return router;
}

module.exports = { createInternalRoutes };