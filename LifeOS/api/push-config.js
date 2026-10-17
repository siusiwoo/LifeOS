'use strict';

module.exports = function handler(_request, response) {
  response.setHeader('Cache-Control', 'no-store');
  const key = process.env.VAPID_PUBLIC_KEY || '';
  response.status(key ? 200 : 503).json({ publicKey: key, configured: Boolean(key) });
};
