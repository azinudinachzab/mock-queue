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
    async findByTicket(ticketNumber, branchCode) {
      return repository.findQueueByTicket(ticketNumber, branchCode);
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
    async start(ticketNumber, staff) {
      return transition(repository, ticketNumber, 'serving', ['pending'], staff);
    },
    async complete(ticketNumber, staff) {
      return transition(repository, ticketNumber, 'completed', ['serving'], staff);
    },
    async cancel(ticketNumber, staff) {
      return transition(repository, ticketNumber, 'cancelled', ['pending', 'serving'], staff);
    },
  };
}

async function transition(repository, ticketNumber, nextStatus, allowedStatuses, staff) {
  const entry = await repository.findQueueByTicket(ticketNumber);
  if (!entry) return { error: 'Ticket not found', notFound: true };
  const assignment = await repository.findActiveStaffAssignment(staff, entry.branch.code);
  if (!assignment) return { error: 'Staff agent is not assigned to this counter or branch', forbidden: true };
  if (!allowedStatuses.includes(entry.status)) {
    return { error: `Cannot change ticket from ${entry.status} to ${nextStatus}` };
  }
  const updated = await repository.updateQueueStatus(ticketNumber, nextStatus);
  if (nextStatus === 'serving') {
    await repository.createQueueHandling(entry, staff);
  } else {
    await repository.closeQueueHandling(entry.id, nextStatus);
  }
  return { entry: updated };
}

module.exports = { createQueueService };
