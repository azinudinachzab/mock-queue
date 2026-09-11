const { MAX_DISTANCE_KM } = require('../constants');
const { parseBarcode } = require('../utils/barcode');

function createBranchService(repository) {
  return {
    async validate(input) {
      const scannedBranch = input.branch || parseBarcode(input.barcode);
      if (!scannedBranch) {
        return { error: 'A branch object or barcode containing branch information is required' };
      }
      if (typeof scannedBranch !== 'object' || !scannedBranch.code) {
        return { error: 'Invalid branch information' };
      }

      const branch = await repository.findBranchByCode(scannedBranch.code);
      if (!branch || (scannedBranch.name && branch.name !== scannedBranch.name)) {
        return { error: 'Invalid branch information' };
      }
      return { branch: publicBranch(branch), maxDistanceKm: MAX_DISTANCE_KM };
    },
  };
}

function publicBranch(branch) {
  return {
    code: branch.code,
    name: branch.name,
    address: branch.address,
    latitude: branch.latitude,
    longitude: branch.longitude,
    status: branch.status,
  };
}

module.exports = { createBranchService };
