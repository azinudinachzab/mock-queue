const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { app, queue, repository } = require('../app');

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

    const ticket = await request(server, 'GET', `/api/queue/${created.body.ticketNumber}`);
    assert.equal(ticket.status, 200);
    assert.equal(ticket.body.ticketNumber, created.body.ticketNumber);
    assert.equal(ticket.body.branch.status, true);
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
    const create = (serviceType) => request(server, 'POST', '/api/queue', {
      branchCode: 'BR-001',
      name: 'Valid Name', phoneNumber: '0123456789', serviceType,
      latitude: 3.139003, longitude: 101.686855,
    });

    const firstHmTicket = (await create('HM')).body.ticketNumber;
    const secondHmTicket = (await create('HM')).body.ticketNumber;
    assert.equal(Number(secondHmTicket.slice(3)), Number(firstHmTicket.slice(3)) + 1);
    assert.equal((await create('SF')).body.ticketNumber, 'SF-001');
  } finally {
    server.close();
  }
});

test('keeps queue sequences separate by branch', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const create = (branchCode) => request(server, 'POST', '/api/public/queue', {
      branchCode,
      name: 'Valid Name', phoneNumber: '0123456789', serviceType: 'HM',
      latitude: branchCode === 'BR-001' ? 3.139003 : 3.173825,
      longitude: branchCode === 'BR-001' ? 101.686855 : 101.689674,
    });

    assert.match((await create('BR-001')).body.ticketNumber, /^HM-\d{3}$/);
    const secondBranchTicket = (await create('BR-002')).body.ticketNumber;
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
    const started = await requestWithHeaders(server, 'POST', `/api/internal/queue/${ticketNumber}/start`, staffHeaders);
    assert.equal(started.status, 200);
    assert.equal(started.body.status, 'serving');

    const completed = await requestWithHeaders(server, 'POST', `/api/internal/queue/${ticketNumber}/complete`, staffHeaders);
    assert.equal(completed.status, 200);
    assert.equal(completed.body.status, 'completed');

    const invalidRestart = await requestWithHeaders(server, 'POST', `/api/internal/queue/${ticketNumber}/start`, staffHeaders);
    assert.equal(invalidRestart.status, 409);

    assert.equal(repository.queueHandling.length, 1);
    assert.equal(repository.queueHandling[0].status, 'completed');
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

    const missingContext = await request(server, 'POST', `/api/internal/queue/${ticketNumber}/start`);
    assert.equal(missingContext.status, 401);

    const wrongBranch = await requestWithHeaders(server, 'POST', `/api/internal/queue/${ticketNumber}/start`, {
      'x-staff-agent-id': '1', 'x-staff-counter-id': '1',
    });
    assert.equal(wrongBranch.status, 403);
  } finally {
    server.close();
  }
});
