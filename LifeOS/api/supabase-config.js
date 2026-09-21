module.exports = function handler(_request, response) {
  response.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  response.setHeader('Cache-Control', 'no-store');
  response.status(200).send(
    `window.LIFEOS_SUPABASE_CONFIG = ${JSON.stringify({
      url: process.env.SUPABASE_URL || '',
      key: process.env.SUPABASE_PUBLISHABLE_KEY || ''
    })};`
  );
};
