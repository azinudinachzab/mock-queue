const express = require('express');
const app = express();
const PORT = 3030;
const SERVICE_TYPES = ['HM', 'SF', 'PR', 'RG', 'LL'];
const queue = [];
const ticketSequences = new Map();
const MAX_DISTANCE_KM = 2;

// Replace these values with the application's real branch registry.
const branches = [
  {
    code: 'BR-001',
    name: 'Central Branch',
    address: '1 Main Street',
    latitude: 3.139003,
    longitude: 101.686855,
  },
  {
    code: 'BR-002',
    name: 'North Branch',
    address: '20 North Avenue',
    latitude: 3.173825,
    longitude: 101.689674,
  },
];

app.use(express.json());

// routing starts here
app.get('/', (req, res) => {
  res.json({ name: 'Queue API', status: 'ok' });
});

app.get('/queue', (req, res) => {
  return listQueue(req, res);
});

app.get('/api/queue', (req, res) => {
  return listQueue(req, res);
});

app.get('/api/queue/:ticketNumber', (req, res) => {
  const queueEntry = queue.find((entry) => entry.ticketNumber === req.params.ticketNumber);

  if (!queueEntry) {
    return res.status(404).json({ error: 'Ticket not found' });
  }

  return res.json(queueEntry);
});

app.post('/api/branches/validate', (req, res) => {
  const { branch, barcode, latitude, longitude } = req.body;
  const scannedBranch = branch || parseBarcode(barcode);

  if (!scannedBranch) {
    return res.status(400).json({
      error: 'A branch object or barcode containing branch information is required',
    });
  }

  const branchRecord = findBranch(scannedBranch);
  if (!branchRecord) {
    return res.status(400).json({ error: 'Invalid branch information' });
  }

  const locationError = validateLocation(latitude, longitude, branchRecord);
  if (locationError) {
    return res.status(400).json({ error: locationError });
  }

  return res.json({ branch: publicBranch(branchRecord), maxDistanceKm: MAX_DISTANCE_KM });
});

app.post('/queue', createQueueEntry);
app.post('/api/queue', createQueueEntry);

// routing ends here

// business logic starts here

function createQueueEntry(req, res) {
  const { branchCode, name, phoneNumber, serviceType, latitude, longitude } = req.body;

  if (!branchCode || !name || !phoneNumber || !serviceType || latitude === undefined || longitude === undefined) {
    return res.status(400).json({
      error: 'branchCode, name, phoneNumber, serviceType, latitude, and longitude are required',
    });
  }

  const branch = branches.find((item) => item.code === branchCode);
  if (!branch) {
    return res.status(400).json({ error: 'Invalid branchCode' });
  }

  const locationError = validateLocation(latitude, longitude, branch);
  if (locationError) {
    return res.status(400).json({ error: locationError });
  }

  if (typeof name !== 'string' || name.length < 2 || name.length > 100 || !/^[\p{L}][\p{L} .'-]*$/u.test(name)) {
    return res.status(400).json({ error: 'name contains invalid characters' });
  }

  if (typeof phoneNumber !== 'string' || !/^\d{7,15}$/.test(phoneNumber)) {
    return res.status(400).json({ error: 'phoneNumber must contain 7 to 15 digits' });
  }

  if (!SERVICE_TYPES.includes(serviceType)) {
    return res.status(400).json({
      error: `serviceType must be one of: ${SERVICE_TYPES.join(', ')}`,
    });
  }

  const ticketNumber = createTicketNumber(serviceType);
  const queueEntry = {
    id: queue.length + 1,
    ticketNumber,
    branch: publicBranch(branch),
    name,
    phoneNumber,
    serviceType,
    status: 'pending',
    createdAt: new Date().toISOString(),
  };

  queue.push(queueEntry);
  return res.status(201).json(queueEntry);
}

function listQueue(req, res) {
  const { status } = req.query;
  if (status && !['pending', 'serving', 'completed', 'cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status filter' });
  }

  return res.json(status ? queue.filter((entry) => entry.status === status) : queue);
}

function findBranch(scannedBranch) {
  if (typeof scannedBranch !== 'object' || !scannedBranch) return null;
  return branches.find((item) =>
    item.code === scannedBranch.code &&
    (!scannedBranch.name || item.name === scannedBranch.name)
  );
}

function parseBarcode(barcode) {
  if (!barcode) return null;
  if (typeof barcode === 'object') return barcode;
  if (typeof barcode !== 'string') return null;

  try {
    return JSON.parse(barcode);
  } catch {
    try {
      return JSON.parse(Buffer.from(barcode, 'base64url').toString('utf8'));
    } catch {
      return null;
    }
  }
}

function validateLocation(latitude, longitude, branch) {
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return 'latitude and longitude must be valid numbers';
  }

  const userLatitude = Number(latitude);
  const userLongitude = Number(longitude);
  if (userLatitude < -90 || userLatitude > 90 || userLongitude < -180 || userLongitude > 180) {
    return 'latitude or longitude is out of range';
  }

  if (distanceInKm(userLatitude, userLongitude, branch.latitude, branch.longitude) > MAX_DISTANCE_KM) {
    return `User must be within ${MAX_DISTANCE_KM} km of the branch`;
  }

  return null;
}

function distanceInKm(latitude1, longitude1, latitude2, longitude2) {
  const earthRadiusKm = 6371;
  const latitudeDelta = toRadians(latitude2 - latitude1);
  const longitudeDelta = toRadians(longitude2 - longitude1);
  const a = Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(toRadians(latitude1)) * Math.cos(toRadians(latitude2)) * Math.sin(longitudeDelta / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return value * Math.PI / 180;
}

function publicBranch(branch) {
  return {
    code: branch.code,
    name: branch.name,
    address: branch.address,
    latitude: branch.latitude,
    longitude: branch.longitude,
  };
}

function createTicketNumber(serviceType) {
  const date = new Date().toISOString().slice(0, 10).replaceAll('-', '');
  const sequenceKey = `${date}:${serviceType}`;
  const nextSequence = (ticketSequences.get(sequenceKey) || 0) + 1;
  ticketSequences.set(sequenceKey, nextSequence);
  return `${serviceType}-${String(nextSequence).padStart(3, '0')}`;
}

// business logic ends here

// ===========================================================================
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
}
// ===========================================================================

module.exports = { app, branches, queue, distanceInKm };
