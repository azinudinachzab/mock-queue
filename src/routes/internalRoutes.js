const express = require('express');
const { requireStaffContext } = require('../middleware/staffContext');

function createInternalRoutes(queueController) {
  const router = express.Router();
  router.use(requireStaffContext);
  router.get('/queue', queueController.list);
  router.post('/queue/:ticketNumber/start', queueController.start);
  router.post('/queue/:ticketNumber/complete', queueController.complete);
  router.post('/queue/:ticketNumber/cancel', queueController.cancel);
  router.get('/queue/:ticketNumber', queueController.findByTicket);
  return router;
}

module.exports = { createInternalRoutes };