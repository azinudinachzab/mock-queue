const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { app, queue, repository } = require('../app');

test.beforeEach(async () => {
  const operatingDate = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  await repository.startQueueDay('BR-001', operatingDate, new Date());
  await repository.startQueueDay('BR-002', operatingDate, new Date());
});

function request(server, method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const address = server.address();
    const requestOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      method,
      path,
      headers: payload
        ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload), ...headers }
        : headers,
    };
    const request = http.request(requestOptions, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(data) }));
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

function requestWithHeaders(server, method, path, headers) {
  return request(server, method, path, undefined, headers);
}

test('validates a scanned branch without FE coordinates and creates a pending ticket', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const branch = await request(server, 'POST', '/api/branches/validate', {
      barcode: JSON.stringify({ code: 'BR-001', name: 'Central Branch' }),
    });
    assert.equal(branch.status, 200);
    assert.deepEqual(branch.body.branch, {
      code: 'BR-001',
      name: 'Central Branch',
      address: '1 Main Street',
      latitude: 3.139003,
      longitude: 101.686855,
      status: true,
    });

    const created = await request(server, 'POST', '/api/queue', {
      branchCode: 'BR-001',
      name: 'Azinudin Test',
      phoneNumber: '0123456789',
      serviceType: 'HM',
      latitude: 3.139003,
      longitude: 101.686855,
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.status, 'pending');
    assert.match(created.body.ticketNumber, /^HM-\d{3}$/);
    assert.equal(created.body.queueDate.slice(0, 10), new Date().toISOString().slice(0, 10));
    assert.ok(created.body.updatedAt);

    const ticket = await request(server, 'GET', `/api/queue/${created.body.ticketNumber}`);
    assert.equal(ticket.status, 200);
    assert.equal(ticket.body.ticketNumber, created.body.ticketNumber);
    assert.equal(ticket.body.branch.status, true);
  } finally {
    server.close();
  }
});

test('rejects public ticket creation when branch queue status is not configured', async () => {
  const operatingDate = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  repository.branchQueueStatuses?.delete(`BR-001:${operatingDate}`);
  const server = app.listen(0);
  try {
    const response = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Valid Name', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(response.status, 503);
  } finally {
    server.close();
  }
});

test('rejects invalid phone numbers and locations outside 2 km', async () => {
  const server = app.listen(0);
  try {
    const invalidPhone = await request(server, 'POST', '/api/queue', {
      branchCode: 'BR-001', name: 'Valid Name', phoneNumber: 'abc', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(invalidPhone.status, 400);

    const tooFar = await request(server, 'POST', '/api/queue', {
      branchCode: 'BR-001', name: 'Valid Name', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 4, longitude: 101,
    });
    assert.equal(tooFar.status, 400);

    const branchWithoutAssignmentFields = await request(server, 'POST', '/api/branches/validate', {
      branch: { code: 'BR-001' },
    });
    assert.equal(branchWithoutAssignmentFields.status, 200);

  } finally {
    server.close();
  }
});

test('keeps queue sequences separate by service type', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const create = (serviceType, phoneNumber) => request(server, 'POST', '/api/queue', {
      branchCode: 'BR-001',
      name: 'Valid Name', phoneNumber, serviceType,
      latitude: 3.139003, longitude: 101.686855,
    });

    const firstHmTicket = (await create('HM', '0123456789')).body.ticketNumber;
    const secondHmTicket = (await create('HM', '0123456790')).body.ticketNumber;
    assert.equal(Number(secondHmTicket.slice(3)), Number(firstHmTicket.slice(3)) + 1);
    assert.equal((await create('SF', '0123456791')).body.ticketNumber, 'SF-001');
  } finally {
    server.close();
  }
});

test('keeps queue sequences separate by branch', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const create = (branchCode, phoneNumber) => request(server, 'POST', '/api/public/queue', {
      branchCode,
      name: 'Valid Name', phoneNumber, serviceType: 'HM',
      latitude: branchCode === 'BR-001' ? 3.139003 : 3.173825,
      longitude: branchCode === 'BR-001' ? 101.686855 : 101.689674,
    });

    assert.match((await create('BR-001', '0123456789')).body.ticketNumber, /^HM-\d{3}$/);
    const secondBranchTicket = (await create('BR-002', '0123456792')).body.ticketNumber;
    assert.equal(secondBranchTicket, 'HM-001');

    const branchTicket = await request(server, 'GET', `/api/public/branches/BR-002/queue/${secondBranchTicket}`);
    assert.equal(branchTicket.status, 200);
    assert.equal(branchTicket.body.branch.code, 'BR-002');
  } finally {
    server.close();
  }
});

test('separates public creation from internal queue monitoring', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const publicList = await request(server, 'GET', '/api/public/queue');
    assert.equal(publicList.status, 404);

    const internalList = await requestWithHeaders(server, 'GET', '/api/internal/queue', {
      'x-staff-agent-id': '1', 'x-staff-counter-id': '1',
    });
    assert.equal(internalList.status, 200);
    assert.deepEqual(internalList.body, []);
  } finally {
    server.close();
  }
});

test('starts today queue and returns counter dashboard data', async () => {
  queue.length = 0;
  const operatingDate = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  repository.branchQueueStatuses.set(`BR-001:${operatingDate}`, {
    branchCode: 'BR-001', operatingDate, status: 'open', startedAt: null,
  });
  const server = app.listen(0);
  const staffHeaders = { 'x-staff-agent-id': '1', 'x-staff-counter-id': '1' };
  try {
    const notStarted = await requestWithHeaders(server, 'GET', '/api/internal/dashboard', staffHeaders);
    assert.equal(notStarted.status, 409);
    const rejected = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Before Start', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(rejected.status, 409);

    const started = await requestWithHeaders(server, 'POST', '/api/internal/dashboard/start', staffHeaders);
    assert.equal(started.status, 200);
    assert.equal(started.body.branch.code, 'BR-001');
    assert.equal(started.body.counter.id, 1);
    assert.equal(started.body.waitingCount, 0);
    assert.equal(started.body.currentQueue, 0);
    assert.equal(typeof started.body.availableCounterCount, 'number');
    assert.equal(started.body.currentTicket, 0);
    assert.ok(started.body.queueDay.startedAt);
    assert.ok(started.body.durationSeconds >= 0);

    const created = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Dashboard Customer', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(created.status, 201);

    const dashboard = await requestWithHeaders(server, 'GET', '/api/internal/dashboard', staffHeaders);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.nextTicket, created.body.ticketNumber);
    assert.equal(dashboard.body.currentQueue, 1);
    assert.equal(dashboard.body.waitingCount, dashboard.body.currentQueue);
  } finally {
    server.close();
  }
});

test('allows staff to transition tickets through internal queue actions', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const created = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Valid Name', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    const ticketNumber = created.body.ticketNumber;

    const staffHeaders = { 'x-staff-agent-id': '1', 'x-staff-counter-id': '1' };
    const started = await request(server, 'PATCH', `/api/internal/queue/${ticketNumber}/status`, { status: 'serving' }, staffHeaders);
    assert.equal(started.status, 200);
    assert.equal(started.body.status, 'serving');

    const completed = await request(server, 'PATCH', `/api/internal/queue/${ticketNumber}/status`, { status: 'completed' }, staffHeaders);
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, 'completed');

    const invalidRestart = await request(server, 'PATCH', `/api/internal/queue/${ticketNumber}/status`, { status: 'serving' }, staffHeaders);
    assert.equal(invalidRestart.status, 409);

    const secondCreated = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Another Name', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    const cancelled = await request(server, 'PATCH', `/api/internal/queue/${secondCreated.body.ticketNumber}/status`, { status: 'cancelled' }, staffHeaders);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, 'cancelled');

    assert.equal(repository.queueHandling.length, 1);
    assert.equal(repository.queueHandling[0].status, 'completed');
  } finally {
    server.close();
  }
});

test('prevents an unfinished same-day queue for the same phone across branches', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const create = (branchCode, phoneNumber) => request(server, 'POST', '/api/public/queue', {
      branchCode, name: 'Valid Name', phoneNumber, serviceType: 'HM',
      latitude: branchCode === 'BR-001' ? 3.139003 : 3.173825,
      longitude: branchCode === 'BR-001' ? 101.686855 : 101.689674,
    });
    const first = await create('BR-001', '0123456789');
    const duplicate = await create('BR-002', '0123456789');
    assert.equal(first.status, 201);
    assert.equal(duplicate.status, 409);

    const staffHeaders = { 'x-staff-agent-id': '1', 'x-staff-counter-id': '1' };
    const completed = await request(server, 'PATCH', `/api/internal/queue/${first.body.ticketNumber}/status`, { status: 'serving' }, staffHeaders);
    assert.equal(completed.status, 200);
    await request(server, 'PATCH', `/api/internal/queue/${first.body.ticketNumber}/status`, { status: 'completed' }, staffHeaders);
    const allowed = await create('BR-002', '0123456789');
    assert.equal(allowed.status, 201);
  } finally {
    server.close();
  }
});

test('supports skip, no-show, and recall queue actions', async () => {
  queue.length = 0;
  const server = app.listen(0);
  const staffHeaders = { 'x-staff-agent-id': '1', 'x-staff-counter-id': '1' };
  try {
    const create = (phoneNumber) => request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Valid Name', phoneNumber, serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    const skipped = await create('0123456789');
    const skippedResult = await request(server, 'PATCH', `/api/internal/queue/${skipped.body.ticketNumber}/status`, { status: 'skipped' }, staffHeaders);
    assert.equal(skippedResult.status, 200);
    assert.equal(skippedResult.body.status, 'skipped');

    const noShow = await create('0123456790');
    const noShowResult = await request(server, 'PATCH', `/api/internal/queue/${noShow.body.ticketNumber}/status`, { status: 'no_show' }, staffHeaders);
    assert.equal(noShowResult.status, 200);
    assert.equal(noShowResult.body.status, 'no_show');

    const recalled = await create('0123456791');
    await request(server, 'PATCH', `/api/internal/queue/${recalled.body.ticketNumber}/status`, { status: 'serving' }, staffHeaders);
    const recalledResult = await request(server, 'POST', `/api/internal/queue/${recalled.body.ticketNumber}/recall`, undefined, staffHeaders);
    assert.equal(recalledResult.status, 200);
    assert.equal(recalledResult.body.status, 'serving');
    assert.equal(repository.queueHandling.filter((handling) => handling.queueId === recalled.body.id).length, 2);
    assert.equal(repository.queueHandling.find((handling) => handling.queueId === recalled.body.id).status, 'recalled');
    await request(server, 'PATCH', `/api/internal/queue/${recalled.body.ticketNumber}/status`, { status: 'completed' }, staffHeaders);
  } finally {
    server.close();
  }
});

test('requires staff context and enforces staff branch assignment', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const created = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-002', name: 'Valid Name', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.173825, longitude: 101.689674,
    });
    const ticketNumber = created.body.ticketNumber;

    const missingContext = await request(server, 'PATCH', `/api/internal/queue/${ticketNumber}/status`, { status: 'serving' });
    assert.equal(missingContext.status, 401);

    const wrongBranch = await request(server, 'PATCH', `/api/internal/queue/${ticketNumber}/status`, { status: 'serving' }, {
      'x-staff-agent-id': '1', 'x-staff-counter-id': '1',
    });
    assert.equal(wrongBranch.status, 403);
  } finally {
    server.close();
  }
});

test('staff can close one branch queue day and public creation is rejected', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const operatingDate = new Date().toISOString().slice(0, 10).replaceAll('-', '');
    const closed = await request(server, 'PATCH', '/api/internal/branches/BR-001/queue-status', {
      operatingDate, status: 'closed',
    }, {
      'x-staff-agent-id': '1',
      'x-staff-counter-id': '1',
    });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.status, 'closed');

    const created = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Valid Name', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(created.status, 409);
  } finally {
    server.close();
  }
});

test('staff can manage counters and cannot serve two tickets on one counter', async () => {
  queue.length = 0;
  const server = app.listen(0);
  const staffHeaders = { 'x-staff-agent-id': '1', 'x-staff-counter-id': '1' };
  try {
    const createdCounter = await request(server, 'POST', '/api/internal/counters', {
      branchCode: 'BR-001', counterCode: 'CTR-003', counterName: 'Second Counter',
    }, staffHeaders);
    assert.equal(createdCounter.status, 201);

    const assigned = await request(server, 'POST', `/api/internal/counters/${createdCounter.body.id}/assignment`, {
      salesAgentId: 1,
    }, staffHeaders);
    assert.equal(assigned.status, 200);

    const first = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'First Customer', phoneNumber: '0123456794', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    const second = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Second Customer', phoneNumber: '0123456795', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });

    const started = await request(server, 'PATCH', `/api/internal/queue/${first.body.ticketNumber}/status`, { status: 'serving' }, staffHeaders);
    assert.equal(started.status, 200);
    const busy = await request(server, 'PATCH', `/api/internal/queue/${second.body.ticketNumber}/status`, { status: 'serving' }, staffHeaders);
    assert.equal(busy.status, 409);
  } finally {
    server.close();
  }
});

test('resolves the staff branch and restricts counter configuration to that branch', async () => {
  const server = app.listen(0);
  const staffHeaders = { 'x-staff-agent-id': '1', 'x-staff-counter-id': '1' };
  try {
    const counters = await requestWithHeaders(server, 'GET', '/api/internal/counters', staffHeaders);
    assert.equal(counters.status, 200);
    assert.ok(counters.body.length > 0);
    assert.ok(counters.body.every((counter) => counter.branchCode === 'BR-001'));

    const wrongBranchCounter = await requestWithHeaders(server, 'GET', '/api/internal/counters', {
      'x-staff-agent-id': '1', 'x-staff-counter-id': '2',
    });
    assert.equal(wrongBranchCounter.status, 403);
    assert.equal(wrongBranchCounter.body.error, 'Counter is not configured for the staff branch');

    const updated = await request(server, 'PATCH', '/api/internal/counters/1', {
      counterCode: 'CTR-001-UPDATED', counterName: 'Updated Main Counter', serviceTypes: ['HM'],
    }, staffHeaders);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.counterCode, 'CTR-001-UPDATED');
    assert.deepEqual(updated.body.serviceTypes, ['HM']);

    const duplicate = await request(server, 'PATCH', '/api/internal/counters/1', {
      counterCode: 'CTR-002',
    }, staffHeaders);
    assert.equal(duplicate.status, 409);

    const regularTicket = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Regular Customer', phoneNumber: '0123456796', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    const priorityTicket = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Priority Customer', phoneNumber: '0123456797', serviceType: 'PR',
      latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(regularTicket.status, 201);
    assert.equal(priorityTicket.status, 201);

    await request(server, 'PATCH', '/api/internal/counters/1', { counterType: 'priority' }, staffHeaders);
    const unmappedPriority = await request(server, 'PATCH', `/api/internal/queue/${priorityTicket.body.ticketNumber}/status`, {
      status: 'serving',
    }, staffHeaders);
    assert.equal(unmappedPriority.status, 403);

    await request(server, 'PATCH', '/api/internal/counters/1', {
      counterType: 'priority', serviceTypes: ['HM', 'PR'],
    }, staffHeaders);

    const latest = await requestWithHeaders(server, 'GET', '/api/internal/counters', staffHeaders);
    assert.equal(latest.body.find((counter) => counter.id === 1).counterName, 'Updated Main Counter');

    const dashboard = await requestWithHeaders(server, 'POST', '/api/internal/dashboard/start', staffHeaders);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.counter.name, 'Updated Main Counter');
    assert.equal(dashboard.body.nextTicket, priorityTicket.body.ticketNumber);

    await request(server, 'PATCH', '/api/internal/counters/1', { counterType: 'regular' }, staffHeaders);
    const regularCounter = await request(server, 'POST', '/api/internal/counters', {
      branchCode: 'BR-001', counterCode: 'CTR-REGULAR-FALLBACK', counterName: 'Regular Fallback',
      counterType: 'regular', serviceTypes: ['PR'],
    }, staffHeaders);
    assert.equal(regularCounter.status, 201);
    const fallbackHeaders = { 'x-staff-agent-id': '1', 'x-staff-counter-id': String(regularCounter.body.id) };
    const fallbackSelection = await requestWithHeaders(server, 'POST', `/api/internal/counters/${regularCounter.body.id}/select`, {
      'x-staff-agent-id': '1',
    });
    assert.equal(fallbackSelection.status, 200);
    const priorityCounter = await request(server, 'POST', '/api/internal/counters', {
      branchCode: 'BR-001', counterCode: 'CTR-PRIORITY-FALLBACK', counterName: 'Priority Fallback',
      counterType: 'priority', serviceTypes: ['PR'],
    }, staffHeaders);
    assert.equal(priorityCounter.status, 201);
    const blockedByPriority = await request(server, 'PATCH', `/api/internal/queue/${priorityTicket.body.ticketNumber}/status`, {
      status: 'serving',
    }, fallbackHeaders);
    assert.equal(blockedByPriority.status, 403);
    const prioritySelection = await requestWithHeaders(server, 'POST', `/api/internal/counters/${priorityCounter.body.id}/select`, {
      'x-staff-agent-id': '1',
    });
    assert.equal(prioritySelection.status, 200);
    const fallbackWhilePriorityBusy = await request(server, 'PATCH', `/api/internal/queue/${priorityTicket.body.ticketNumber}/status`, {
      status: 'serving',
    }, fallbackHeaders);
    assert.equal(fallbackWhilePriorityBusy.status, 200);
    await requestWithHeaders(server, 'DELETE', `/api/internal/counters/${priorityCounter.body.id}/select`, {
      'x-staff-agent-id': '1',
    });
  } finally {
    server.close();
  }
});

test('lists and confirms only counters available to the internal agent', async () => {
  const server = app.listen(0);
  try {
    const available = await requestWithHeaders(server, 'GET', '/api/internal/counters/available', {
      'x-staff-agent-id': '1',
    });
    assert.equal(available.status, 200);
    assert.ok(available.body.length > 0);
    assert.ok(available.body.every((counter) => counter.branchCode === 'BR-001'));
    assert.ok(available.body.every((counter) => counter.availability === 'available'));
    const selectedCounterId = available.body[0].id;

    const selected = await requestWithHeaders(server, 'POST', `/api/internal/counters/${selectedCounterId}/select`, {
      'x-staff-agent-id': '1',
    });
    assert.equal(selected.status, 200);
    assert.equal(selected.body.availability, 'occupied');
    assert.equal(selected.body.assignedAgentId, 1);

    const unavailable = await requestWithHeaders(server, 'POST', '/api/internal/counters/2/select', {
      'x-staff-agent-id': '1',
    });
    assert.equal(unavailable.status, 403);
  } finally {
    server.close();
  }
});

test('reflects selection and release immediately for another internal', async () => {
  const server = app.listen(0);
  const primaryHeaders = { 'x-staff-agent-id': '1' };
  try {
    const primaryAvailable = await requestWithHeaders(server, 'GET', '/api/internal/counters/available', primaryHeaders);
    assert.equal(primaryAvailable.status, 200);
    const counterId = primaryAvailable.body[0].id;
    const primarySelection = await requestWithHeaders(server, 'POST', `/api/internal/counters/${counterId}/select`, primaryHeaders);
    assert.equal(primarySelection.status, 200);
    const createdAgent = await repository.createSalesAgent({
      branchCode: 'BR-001', employeeId: 'EMP-REALTIME', agentName: 'Realtime Agent',
      status: 'active',
    });
    const otherHeaders = { 'x-staff-agent-id': String(createdAgent.id) };

    const beforeRelease = await requestWithHeaders(server, 'GET', '/api/internal/counters/available', otherHeaders);
    assert.equal(beforeRelease.status, 200);
    assert.ok(!beforeRelease.body.some((counter) => counter.id === counterId));

    const released = await requestWithHeaders(server, 'DELETE', `/api/internal/counters/${counterId}/select`, primaryHeaders);
    assert.equal(released.status, 200);
    assert.equal(released.body.availability, 'available');

    const afterRelease = await requestWithHeaders(server, 'GET', '/api/internal/counters/available', otherHeaders);
    assert.ok(afterRelease.body.some((counter) => counter.id === counterId));
    const selected = await requestWithHeaders(server, 'POST', `/api/internal/counters/${counterId}/select`, otherHeaders);
    assert.equal(selected.status, 200);
    assert.equal(selected.body.assignedAgentId, createdAgent.id);

    const ended = await requestWithHeaders(server, 'POST', `/api/internal/counters/${counterId}/session/end`, otherHeaders);
    assert.equal(ended.status, 200);
    assert.equal(ended.body.availability, 'available');
  } finally {
    server.close();
  }
});

test('staff can manage sales agents within their branch', async () => {
  const server = app.listen(0);
  const staffHeaders = { 'x-staff-agent-id': '1', 'x-staff-counter-id': '1' };
  try {
    const created = await request(server, 'POST', '/api/internal/sales-agents', {
      branchCode: 'BR-001', employeeId: 'EMP-003', agentName: 'New Agent',
    }, staffHeaders);
    assert.equal(created.status, 201);
    assert.equal(created.body.employeeId, 'EMP-003');

    const listed = await requestWithHeaders(server, 'GET', '/api/internal/sales-agents?branchCode=BR-001', staffHeaders);
    assert.equal(listed.status, 200);
    assert.ok(listed.body.some((agent) => agent.employeeId === 'EMP-003'));

    const updated = await request(server, 'PATCH', `/api/internal/sales-agents/${created.body.id}`, {
      agentName: 'Updated Agent',
    }, staffHeaders);
    assert.equal(updated.status, 200);
    assert.equal(updated.body.agentName, 'Updated Agent');

    const removed = await request(server, 'DELETE', `/api/internal/sales-agents/${created.body.id}`, undefined, staffHeaders);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.status, 'inactive');
  } finally {
    server.close();
  }
});
