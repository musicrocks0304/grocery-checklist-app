// Reads the real backend settings for the `live` project. Refuses without a key.
const fs = require('fs');
function readLiveEnv() {
  const text = fs.existsSync('.env') ? fs.readFileSync('.env', 'utf8') : '';
  const get = (k) => ((text.match(new RegExp(`^${k}=(.*)$`, 'm')) || [])[1] || '').trim().replace(/^['"]|['"]$/g, '');
  const key = get('REACT_APP_API_KEY');
  if (!key) throw new Error('live project: REACT_APP_API_KEY missing from .env');
  return {
    REACT_APP_API_KEY: key,
    REACT_APP_API_BASE_URL: get('REACT_APP_API_BASE_URL') || 'https://n8n-grocery.needexcelexpert.com/webhook',
    REACT_APP_CLIP_SERVER_URL: get('REACT_APP_CLIP_SERVER_URL') || 'https://clip.needexcelexpert.com',
  };
}
module.exports = { readLiveEnv };
