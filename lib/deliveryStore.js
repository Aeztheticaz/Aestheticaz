import crypto from 'crypto';

const pendingCheckouts = new Map();
const downloadByToken = new Map();
const tokenByPhone = new Map();
const DOWNLOAD_TTL_MS = 30 * 60 * 1000; // 30 minutes

function cleanupExpired(entry) {
  if (!entry) return true;
  if (entry.expiresAt < Date.now()) {
    downloadByToken.delete(entry.token);
    if (entry.phone) {
      tokenByPhone.delete(entry.phone);
    }
    return true;
  }
  return false;
}

export function savePendingCheckout(checkoutRequestID, phone, product = 'Aestheticaz Starter Pack', amount = 1200) {
  pendingCheckouts.set(checkoutRequestID, {
    phone,
    product,
    amount,
    createdAt: Date.now()
  });
}

export function completePendingCheckout(checkoutRequestID, phoneOverride) {
  const entry = pendingCheckouts.get(checkoutRequestID);
  if (!entry) return null;

  const phone = phoneOverride || entry.phone;
  const token = crypto.randomBytes(18).toString('hex');
  const delivery = {
    token,
    phone,
    product: entry.product,
    amount: entry.amount,
    filename: 'aestheticaz-starter-pack.txt',
    originalname: 'Aestheticaz-Starter-Pack.txt',
    expiresAt: Date.now() + DOWNLOAD_TTL_MS,
    checkoutRequestID
  };

  downloadByToken.set(token, delivery);
  tokenByPhone.set(phone, token);
  pendingCheckouts.delete(checkoutRequestID);
  return delivery;
}

export function getDeliveryByToken(token) {
  const entry = downloadByToken.get(token);
  if (cleanupExpired(entry)) {
    return null;
  }
  return entry;
}

export function getDeliveryByPhone(phone) {
  const token = tokenByPhone.get(phone);
  if (!token) return null;
  const entry = downloadByToken.get(token);
  if (cleanupExpired(entry)) {
    return null;
  }
  return entry;
}
