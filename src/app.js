const express = require('express');
const { MAX_DISTANCE_KM } = require('./constants');
const { createRepository } = require('./repositories');
const { createBranchService } = require('./services/branchService');
const { createQueueService } = require('./services/queueService');
const { createCounterService } = require('./services/counterService');
const { createSalesAgentService } = require('./services/salesAgentService');
const { createBranchController } = require('./controllers/branchController');
const { createQueueController } = require('./controllers/queueController');
const { createCounterController } = require('./controllers/counterController');
const { createSalesAgentController } = require('./controllers/salesAgentController');
const { createBranchRoutes } = require('./routes/branchRoutes');
const { createQueueRoutes } = require('./routes/queueRoutes');
const { createPublicRoutes } = require('./routes/publicRoutes');
const { createInternalRoutes } = require('./routes/internalRoutes');
const { createCounterRoutes } = require('./routes/counterRoutes');
const { createSalesAgentRoutes } = require('./routes/salesAgentRoutes');

function createApp(options = {}) {
  const repository = createRepository(options);
  const branchController = createBranchController(createBranchService(repository));
  const queueController = createQueueController(createQueueService(repository, options.now));
  const counterController = createCounterController(createCounterService(repository, options.now));
  const salesAgentController = createSalesAgentController(createSalesAgentService(repository));
  const staffContext = require('./middleware/staffContext');
  const requireStaffContext = staffContext.createStaffContext(repository);
  const requireStaffAgentContext = staffContext.createStaffAgentContext(repository);
  const app = express();
  const logger = options.logger || console;

  app.use((req, res, next) => {
    logger.log(`[request] ${req.method} ${req.originalUrl}`);
    next();
  });
  app.use(express.json());
  app.get('/', (req, res) => res.json({ name: 'Queue API', status: 'ok' }));
  app.use('/api/public', createPublicRoutes(branchController, queueController));
  app.use('/api/internal', createInternalRoutes({
    queueController,
    counterRoutes: createCounterRoutes(counterController, requireStaffContext, requireStaffAgentContext),
    salesAgentRoutes: createSalesAgentRoutes(salesAgentController),
    requireStaffContext,
  }));
  app.use('/api/branches', createBranchRoutes(branchController));
  app.use('/api/queue', createQueueRoutes(queueController));
  app.use('/queue', createQueueRoutes(queueController));
  return { app, repository, maxDistanceKm: MAX_DISTANCE_KM };
}

module.exports = { createApp };
