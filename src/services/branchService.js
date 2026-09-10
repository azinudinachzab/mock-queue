const { MAX_DISTANCE_KM } = require('../constants');
const { parseBarcode } = require('../utils/barcode');
const { validateLocation } = require('../utils/location');

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
      const locationError = validateLocation(input.latitude, input.longitude, branch, MAX_DISTANCE_KM);
      if (locationError) return { error: locationError };
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
  };
}

module.exports = { createBranchService };
