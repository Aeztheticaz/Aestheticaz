import express from 'express';
import axios from 'axios';
import dotenv from 'dotenv';
import { savePendingCheckout, completePendingCheckout } from '../lib/deliveryStore.js';

dotenv.config();

const router = express.Router();
const {
  MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET,
  MPESA_SHORTCODE,
  MPESA_PASSKEY,
  MPESA_CALLBACK_URL,
  MPESA_ENV = 'sandbox'
} = process.env;

const baseUrl = MPESA_ENV === 'production'
  ? 'https://api.safaricom.co.ke'
  : 'https://sandbox.safaricom.co.ke';

function getTimestamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  const year = now.getFullYear();
  const month = pad(now.getMonth() + 1);
  const day = pad(now.getDate());
  const hours = pad(now.getHours());
  const minutes = pad(now.getMinutes());
  const seconds = pad(now.getSeconds());
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function getPassword(shortcode, passkey, timestamp) {
  return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
}

async function getAccessToken() {
  if (!MPESA_CONSUMER_KEY || !MPESA_CONSUMER_SECRET) {
    throw new Error('MPESA_CONSUMER_KEY and MPESA_CONSUMER_SECRET must be set.');
  }

  const url = `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`;
  const response = await axios.get(url, {
    auth: {
      username: MPESA_CONSUMER_KEY,
      password: MPESA_CONSUMER_SECRET
    }
  });

  return response.data.access_token;
}

router.post('/checkout', async (req, res) => {
  const { phone, amount, product } = req.body;
  const numericAmount = Number(amount) || 1200;
  const rawPhone = String(phone || '').trim();

  if (!rawPhone) {
    return res.status(400).json({ success: false, message: 'Phone number is required.' });
  }

  let phoneNumber = rawPhone.replace(/\D/g, '');
  if (phoneNumber.startsWith('0')) {
    phoneNumber = `254${phoneNumber.slice(1)}`;
  }

  if (!/^2547\d{8}$/.test(phoneNumber)) {
    return res.status(400).json({
      success: false,
      message: 'Enter a valid Kenyan phone number in the format 2547XXXXXXXX.'
    });
  }

  if (!MPESA_SHORTCODE || !MPESA_PASSKEY || !MPESA_CALLBACK_URL) {
    return res.status(500).json({
      success: false,
      message: 'MPESA configuration is missing. Check environment variables.'
    });
  }

  try {
    const accessToken = await getAccessToken();
    const timestamp = getTimestamp();
    const password = getPassword(MPESA_SHORTCODE, MPESA_PASSKEY, timestamp);

    const payload = {
      BusinessShortCode: MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: numericAmount,
      PartyA: phoneNumber,
      PartyB: MPESA_SHORTCODE,
      PhoneNumber: phoneNumber,
      CallBackURL: MPESA_CALLBACK_URL,
      AccountReference: product || 'Digital Product',
      TransactionDesc: `Purchase of ${product || 'digital product'}`
    };

    const response = await axios.post(`${baseUrl}/mpesa/stkpush/v1/processrequest`, payload, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (response.data?.CheckoutRequestID) {
      savePendingCheckout(response.data.CheckoutRequestID, phoneNumber, product, numericAmount);
    }

    return res.json({
      success: true,
      message: 'STK Push sent. Complete the payment on your phone.',
      data: response.data
    });
  } catch (error) {
    console.error('MPESA checkout error:', error?.response?.data || error?.message || error);
    return res.status(502).json({
      success: false,
      message: 'Unable to start MPesa payment. Please try again later.',
      details: error?.response?.data || error?.message
    });
  }
});

router.post('/callback', (req, res) => {
  const callbackBody = req.body?.Body?.stkCallback;
  console.log('[MPESA CALLBACK]', JSON.stringify(req.body, null, 2));

  if (callbackBody?.ResultCode === 0 && callbackBody?.CheckoutRequestID) {
    const entry = completePendingCheckout(callbackBody.CheckoutRequestID);
    if (entry) {
      console.log('[MPESA DELIVERY READY] Download prepared for', entry.phone, entry.token);
    }
  }

  res.status(200).json({ success: true });
});

export default router;
   