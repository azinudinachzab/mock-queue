const express = require('express');

function createPublicRoutes(branchController, queueController) {
  const router = express.Router();
  router.post('/branches/validate', branchController.validate);
  router.post('/queue', queueController.create);
  router.get('/queue', (req, res) => res.status(404).json({ error: 'Public queue listing is not available' }));
  router.get('/branches/:branchCode/queue/:ticketNumber', queueController.findByTicket);
  return router;
}

module.exports = { createPublicRoutes };