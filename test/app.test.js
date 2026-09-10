const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { app, queue } = require('../app');

function request(server, method, path, body) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : null;
    const address = server.address();
    const requestOptions = {
      hostname: '127.0.0.1',
      port: address.port,
      method,
      path,
      headers: payload
        ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) }
        : {},
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

test('validates a scanned branch and creates a pending ticket', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const branch = await request(server, 'POST', '/api/branches/validate', {
      barcode: JSON.stringify({ code: 'BR-001', name: 'Central Branch' }),
      latitude: 3.139003,
      longitude: 101.686855,
    });
    assert.equal(branch.status, 200);

    const created = await request(server, 'POST', '/api/queue', {
      branchCode: 'BR-001',
      counterNumber: 1,
      agent: { employeeId: 'EMP-1001', name: 'Aina Rahman', phoneNumber: '60123456789' },
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

    const tooFar = await request(server, 'POST', '/api/branches/validate', {
      branch: { code: 'BR-001' },
      latitude: 4, longitude: 101,
    });
    assert.equal(tooFar.status, 400);

    const branchWithoutCounterAndAgent = await request(server, 'POST', '/api/branches/validate', {
      branch: { code: 'BR-001' }, latitude: 3.139003, longitude: 101.686855,
    });
    assert.equal(branchWithoutCounterAndAgent.status, 200);

  } finally {
    server.close();
  }
});

test('keeps queue sequences separate by service type', async () => {
  queue.length = 0;
  const server = app.listen(0);
  try {
    const create = (serviceType) => request(server, 'POST', '/api/queue', {
      branchCode: 'BR-001', counterNumber: 1,
      agent: { employeeId: 'EMP-1001', name: 'Aina Rahman', phoneNumber: '60123456789' },
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
