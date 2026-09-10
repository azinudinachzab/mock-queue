const { MAX_DISTANCE_KM, QUEUE_STATUSES, SERVICE_TYPES } = require('../constants');
const { validateLocation } = require('../utils/location');

function createQueueService(repository, now = () => new Date()) {
  return {
    async list(status) {
      if (status && !QUEUE_STATUSES.includes(status)) {
        return { error: 'Invalid status filter' };
      }
      return { entries: await repository.listQueue(status) };
    },
    async findByTicket(ticketNumber) {
      return repository.findQueueByTicket(ticketNumber);
    },
    async create(input) {
      if (!input.branchCode || !input.name || !input.phoneNumber || !input.serviceType || input.latitude === undefined || input.longitude === undefined) {
        return { error: 'branchCode, name, phoneNumber, serviceType, latitude, and longitude are required' };
      }
      const branch = await repository.findBranchByCode(input.branchCode);
      if (!branch) return { error: 'Invalid branchCode' };
      const locationError = validateLocation(input.latitude, input.longitude, branch, MAX_DISTANCE_KM);
      if (locationError) return { error: locationError };
      if (typeof input.name !== 'string' || input.name.length < 2 || input.name.length > 100 || !/^[\p{L}][\p{L} .'-]*$/u.test(input.name)) {
        return { error: 'name contains invalid characters' };
      }
      if (typeof input.phoneNumber !== 'string' || !/^\d{7,15}$/.test(input.phoneNumber)) {
        return { error: 'phoneNumber must contain 7 to 15 digits' };
      }
      if (!SERVICE_TYPES.includes(input.serviceType)) {
        return { error: `serviceType must be one of: ${SERVICE_TYPES.join(', ')}` };
      }
      const date = now().toISOString().slice(0, 10).replaceAll('-', '');
      return {
        entry: await repository.createQueueEntry({
          ...input,
          branch,
          operatingDate: date,
        }),
      };
    },
  };
}

module.exports = { createQueueService };
