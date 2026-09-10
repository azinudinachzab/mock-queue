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

module.exports = { parseBarcode };
