function validateLocation(latitude, longitude, branch, maxDistanceKm) {
  if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) {
    return 'latitude and longitude must be valid numbers';
  }

  const userLatitude = Number(latitude);
  const userLongitude = Number(longitude);
  if (userLatitude < -90 || userLatitude > 90 || userLongitude < -180 || userLongitude > 180) {
    return 'latitude or longitude is out of range';
  }

  if (distanceInKm(userLatitude, userLongitude, branch.latitude, branch.longitude) > maxDistanceKm) {
    return `User must be within ${maxDistanceKm} km of the branch`;
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

module.exports = { distanceInKm, validateLocation };
