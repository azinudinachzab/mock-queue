const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { PrismaClient } = require('@prisma/client');
const { createApp } = require('../src/app');
const branches = require('../src/data/branches');
const services = require('../src/data/services');
const salesAgents = require('../src/data/salesAgents');
const counters = require('../src/data/counters');

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required for database integration tests');
}

const databaseName = new URL(process.env.DATABASE_URL).pathname.split('/').pop();
if (!/test/i.test(databaseName) && process.env.ALLOW_DATABASE_TESTS !== 'true') {
  throw new Error('Refusing to run database tests unless the database name contains "test" or ALLOW_DATABASE_TESTS=true');
}

const prisma = new PrismaClient();
const { app } = createApp({ prisma });

function operatingDate() {
  return new Date().toISOString().slice(0, 10).replaceAll('-', '');
}

async function resetDatabase() {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE
    "QueueHandling",
    "CounterAssignment",
    "QueueEntry",
    "DailySequence",
    "BranchQueueDay",
    "Counter",
    "SalesAgent",
    "Service",
    "Branch"
    RESTART IDENTITY CASCADE`);

  await prisma.service.createMany({ data: services });
  await prisma.branch.createMany({ data: branches });

  for (const agent of salesAgents) {
    const branch = await prisma.branch.findUnique({ where: { code: agent.branchCode } });
    await prisma.salesAgent.create({
      data: {
        employeeId: agent.employeeId,
        agentName: agent.agentName,
        status: agent.status,
        branchId: branch.id,
      },
    });
  }

  for (const counter of counters) {
    const branch = await prisma.branch.findUnique({ where: { code: counter.branchCode } });
    await prisma.counter.create({
      data: {
        counterCode: counter.counterCode,
        counterName: counter.counterName,
        status: counter.status,
        branchId: branch.id,
      },
    });
  }

  const agents = await prisma.salesAgent.findMany({ orderBy: { id: 'asc' } });
  const seededCounters = await prisma.counter.findMany({ orderBy: { id: 'asc' } });
  await prisma.counterAssignment.createMany({
    data: seededCounters.map((counter, index) => ({
      counterId: counter.id,
      salesAgentId: agents[index].id,
      assignedAt: new Date(),
      status: 'active',
    })),
  });

  await prisma.branchQueueDay.createMany({
    data: branches.map((branch) => ({
      branchCode: branch.code,
      operatingDate: operatingDate(),
      status: 'open',
      startedAt: new Date(),
    })),
  });
}

test.beforeEach(resetDatabase);
test.after(async () => prisma.$disconnect());

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

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test('validates a scanned branch without FE coordinates and creates a pending ticket', async () => {
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
      branchCode: 'BR-001', name: 'Azinudin Test', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
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
    await close(server);
  }
});

test('rejects public ticket creation when branch queue status is not configured', async () => {
  await prisma.branchQueueDay.delete({
    where: { branchCode_operatingDate: { branchCode: 'BR-001', operatingDate: operatingDate() } },
  });
  const server = app.listen(0);
  try {
    const response = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Valid Name', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(response.status, 503);
  } finally {
    await close(server);
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
    await close(server);
  }
});

test('keeps queue sequences separate by service type', async () => {
  const server = app.listen(0);
  try {
    const create = (serviceType, phoneNumber) => request(server, 'POST', '/api/queue', {
      branchCode: 'BR-001', name: 'Valid Name', phoneNumber, serviceType,
      latitude: 3.139003, longitude: 101.686855,
    });
    const firstHmTicket = (await create('HM', '0123456789')).body.ticketNumber;
    const secondHmTicket = (await create('HM', '0123456791')).body.ticketNumber;
    assert.equal(Number(secondHmTicket.slice(3)), Number(firstHmTicket.slice(3)) + 1);
    assert.equal((await create('SF', '0123456792')).body.ticketNumber, 'SF-001');
  } finally {
    await close(server);
  }
});

test('keeps queue sequences separate by branch', async () => {
  const server = app.listen(0);
  try {
    const create = (branchCode, phoneNumber) => request(server, 'POST', '/api/public/queue', {
      branchCode, name: 'Valid Name', phoneNumber, serviceType: 'HM',
      latitude: branchCode === 'BR-001' ? 3.139003 : 3.173825,
      longitude: branchCode === 'BR-001' ? 101.686855 : 101.689674,
    });
    assert.match((await create('BR-001', '0123456789')).body.ticketNumber, /^HM-\d{3}$/);
    const secondBranchTicket = (await create('BR-002', '0123456793')).body.ticketNumber;
    assert.equal(secondBranchTicket, 'HM-001');

    const branchTicket = await request(server, 'GET', `/api/public/branches/BR-002/queue/${secondBranchTicket}`);
    assert.equal(branchTicket.status, 200);
    assert.equal(branchTicket.body.branch.code, 'BR-002');
  } finally {
    await close(server);
  }
});

test('separates public creation from internal queue monitoring', async () => {
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
    await close(server);
  }
});

test('opens today queue and returns the database-backed dashboard summary', async () => {
  await prisma.branchQueueDay.update({
    where: { branchCode_operatingDate: { branchCode: 'BR-001', operatingDate: operatingDate() } },
    data: { startedAt: null },
  });
  const server = app.listen(0);
  const staffHeaders = { 'x-staff-agent-id': '1', 'x-staff-counter-id': '1' };
  try {
    const beforeStart = await requestWithHeaders(server, 'GET', '/api/internal/dashboard', staffHeaders);
    assert.equal(beforeStart.status, 409);
    const started = await requestWithHeaders(server, 'POST', '/api/internal/dashboard/start', staffHeaders);
    assert.equal(started.status, 200);
    assert.equal(started.body.branch.code, 'BR-001');
    assert.equal(started.body.counter.code, 'CTR-001');
    assert.equal(started.body.queueDay.status, 'open');
    assert.ok(started.body.queueDay.startedAt);
    assert.ok(started.body.durationSeconds >= 0);
    assert.equal(started.body.waitingCount, 0);

    const created = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Dashboard Customer', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(created.status, 201);
    const dashboard = await requestWithHeaders(server, 'GET', '/api/internal/dashboard', staffHeaders);
    assert.equal(dashboard.status, 200);
    assert.equal(dashboard.body.waitingCount, 1);
    assert.equal(dashboard.body.nextTicket, created.body.ticketNumber);
  } finally {
    await close(server);
  }
});

test('allows staff to transition tickets through internal queue actions', async () => {
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
      branchCode: 'BR-001', name: 'Another Name', phoneNumber: '0123456790', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    const cancelled = await request(server, 'PATCH', `/api/internal/queue/${secondCreated.body.ticketNumber}/status`, { status: 'cancelled' }, staffHeaders);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.status, 'cancelled');
    assert.equal(await prisma.queueHandling.count(), 1);
  } finally {
    await close(server);
  }
});

test('requires staff context and enforces staff branch assignment', async () => {
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
    await close(server);
  }
});

test('staff can close one branch queue day and public creation is rejected', async () => {
  const server = app.listen(0);
  try {
    const closed = await request(server, 'PATCH', '/api/internal/branches/BR-001/queue-status', {
      operatingDate: operatingDate(), status: 'closed',
    }, { 'x-staff-agent-id': '1', 'x-staff-counter-id': '1' });
    assert.equal(closed.status, 200);
    assert.equal(closed.body.status, 'closed');
    const created = await request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name: 'Valid Name', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(created.status, 409);
  } finally {
    await close(server);
  }
});

test('staff can manage counters and cannot serve two tickets on one counter', async () => {
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
    const create = (name, phoneNumber) => request(server, 'POST', '/api/public/queue', {
      branchCode: 'BR-001', name, phoneNumber, serviceType: 'HM',
      latitude: 3.139003, longitude: 101.686855,
    });
    const first = await create('First Customer', '0123456789');
    const second = await create('Second Customer', '0123456794');
    const started = await request(server, 'PATCH', `/api/internal/queue/${first.body.ticketNumber}/status`, { status: 'serving' }, staffHeaders);
    assert.equal(started.status, 200);
    const busy = await request(server, 'PATCH', `/api/internal/queue/${second.body.ticketNumber}/status`, { status: 'serving' }, staffHeaders);
    assert.equal(busy.status, 409);
  } finally {
    await close(server);
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
    await close(server);
  }
});
