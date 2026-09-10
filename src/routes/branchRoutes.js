const express = require('express');

function createBranchRoutes(controller) {
  const router = express.Router();
  router.post('/validate', controller.validate);
  return router;
}

module.exports = { createBranchRoutes };
