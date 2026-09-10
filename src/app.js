const express = require('express');
const { MAX_DISTANCE_KM } = require('./constants');
const { createRepository } = require('./repositories');
const { createBranchService } = require('./services/branchService');
const { createQueueService } = require('./services/queueService');
const { createBranchController } = require('./controllers/branchController');
const { createQueueController } = require('./controllers/queueController');
const { createBranchRoutes } = require('./routes/branchRoutes');
const { createQueueRoutes } = require('./routes/queueRoutes');

function createApp(options = {}) {
  const repository = createRepository(options);
  const branchController = createBranchController(createBranchService(repository));
  const queueController = createQueueController(createQueueService(repository, options.now));
  const app = express();
  const logger = options.logger || console;

  app.use((req, res, next) => {
    logger.log(`[request] ${req.method} ${req.originalUrl}`);
    next();
  });
  app.use(express.json());
  app.get('/', (req, res) => res.json({ name: 'Queue API', status: 'ok' }));
  app.use('/api/branches', createBranchRoutes(branchController));
  app.use('/api/queue', createQueueRoutes(queueController));
  app.use('/queue', createQueueRoutes(queueController));
  return { app, repository, maxDistanceKm: MAX_DISTANCE_KM };
}

module.exports = { createApp };
