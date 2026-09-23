import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDeliveryByPhone, getDeliveryByToken } from '../lib/deliveryStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const router = express.Router();
const downloadsDir = path.join(__dirname, '..', 'downloads');

router.get('/status', (req, res) => {
  const phone = String(req.query.phone || '').trim();
  if (!phone) {
    return res.status(400).json({ success: false, message: 'Phone number is required for status check.' });
  }

  let normalized = phone.replace(/\D/g, '');
  if (normalized.startsWith('0')) {
    normalized = `254${normalized.slice(1)}`;
  }

  const delivery = getDeliveryByPhone(normalized);
  if (!delivery) {
    return res.json({ success: true, ready: false, message: 'No download is ready yet. Please wait a few moments and try again.' });
  }

  return res.json({
    success: true,
    ready: true,
    downloadUrl: `/api/downloads/${delivery.token}`,
    expiresAt: delivery.expiresAt
  });
});

router.get('/:token', (req, res) => {
  const token = req.params.token;
  const delivery = getDeliveryByToken(token);

  if (!delivery) {
    return res.status(404).send('Download link is invalid or expired.');
  }

  const filePath = path.join(downloadsDir, delivery.filename);
  return res.download(filePath, delivery.originalname, (err) => {
    if (err) {
      console.error('Download error:', err);
      if (!res.headersSent) {
        res.status(500).send('Unable to deliver the file right now.');
      }
    }
  });
});

export default router;
