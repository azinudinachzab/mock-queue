const { BRANCH_QUEUE_STATUSES, MAX_DISTANCE_KM, QUEUE_STATUSES } = require('../constants');
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
      const date = now().toISOString().slice(0, 10).replaceAll('-', '');
      const branchQueue = await repository.findBranchQueueStatus(input.branchCode, date);
      if (!branchQueue) return { error: 'Queue status is not configured for this branch and date', queueStatusNotFound: true };
      if (branchQueue.status === 'closed') return { error: 'Queue is closed for this branch and date', closed: true };
      const locationError = validateLocation(input.latitude, input.longitude, branch, MAX_DISTANCE_KM);
      if (locationError) return { error: locationError };
      if (typeof input.name !== 'string' || input.name.length < 2 || input.name.length > 100 || !/^[\p{L}][\p{L} .'-]*$/u.test(input.name)) {
        return { error: 'name contains invalid characters' };
      }
      if (typeof input.phoneNumber !== 'string' || !/^\d{7,15}$/.test(input.phoneNumber)) {
        return { error: 'phoneNumber must contain 7 to 15 digits' };
      }
      const service = await repository.findServiceByCode(input.serviceType);
      if (!service || service.status !== 'active') return { error: 'Invalid or inactive serviceType' };
      return {
        entry: await repository.createQueueEntry({
          ...input,
          branch,
          service,
          queueDate: new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}T00:00:00.000Z`),
          operatingDate: date,
        }),
      };
    },
    async changeBranchQueueStatus(branchCode, operatingDate, status, staff) {
      if (!BRANCH_QUEUE_STATUSES.includes(status)) return { error: 'status must be open or closed' };
      if (!/^\d{8}$/.test(operatingDate || '')) return { error: 'operatingDate must use YYYYMMDD format' };
      const branch = await repository.findBranchByCode(branchCode);
      if (!branch) return { error: 'Invalid branchCode', notFound: true };
      const assignment = await repository.findActiveStaffAssignment(staff, branchCode);
      if (!assignment) return { error: 'Staff agent is not assigned to this counter or branch', forbidden: true };
      return { queue: await repository.setBranchQueueStatus(branchCode, operatingDate, status) };
    },
    async changeTicketStatus(ticketNumber, status, staff) {
      const transitions = {
        serving: ['pending'],
        completed: ['serving'],
        cancelled: ['pending', 'serving'],
      };
      if (!transitions[status]) return { error: 'status must be serving, completed, or cancelled' };
      return transition(repository, ticketNumber, status, transitions[status], staff);
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
  if (nextStatus === 'serving') {
    if (await repository.hasActiveQueueHandling(entry.id)) {
      return { error: 'Ticket already has an active handling', conflict: true };
    }
    if (await repository.hasActiveCounterHandling(staff.counterId)) {
      return { error: 'Counter is already handling another ticket', conflict: true };
    }
  }
  const updated = repository.transitionQueueStatus
    ? await repository.transitionQueueStatus(ticketNumber, nextStatus, staff)
    : await repository.updateQueueStatus(ticketNumber, nextStatus);
  if (!repository.transitionQueueStatus) {
    if (nextStatus === 'serving') await repository.createQueueHandling(entry, staff);
    else await repository.closeQueueHandling(entry.id, nextStatus);
  }
  return { entry: updated };
}

module.exports = { createQueueService };
