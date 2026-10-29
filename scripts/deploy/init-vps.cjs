const fs = require('node:fs');
const path = require('node:path');
const { initialize } = require('../docker/init-env.cjs');
const { origin } = require('./deployment-config.mjs');
function configure(root, mode, serverDomain, publicOrigin) {
  if (!['vps', 'vercel-backend'].includes(mode)) throw new Error('Mode must be vps or vercel-backend.');
  if (!serverDomain || !/^(?=.{1,253}$)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/i.test(serverDomain) || !serverDomain.includes('.'))
    throw new Error('Supply a DNS hostname for the VPS, without https:// or a port.');
  const publicUrl = origin(publicOrigin, 'Public app URL');
  if (mode === 'vps' && publicUrl.hostname !== serverDomain.toLowerCase())
    throw new Error('In standalone VPS mode the public app URL must use the VPS domain.');
  if (mode === 'vercel-backend' && publicUrl.hostname === serverDomain.toLowerCase())
    throw new Error('The Vercel public domain must differ from the backend domain.');
  const file = initialize(root);
  let body = fs.readFileSync(file, 'utf8');
  for (const [key, value] of Object.entries({
    APP_URL: publicUrl.origin, LOCAL_SINGLE_USER: '0', AUTH_DISABLED: '0',
    STUDIO_DEPLOYMENT_MODE: mode, STUDIO_SERVER_DOMAIN: serverDomain.toLowerCase(),
  })) {
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    body = pattern.test(body) ? body.replace(pattern, `${key}=${value}`) : body.trimEnd() + `\n${key}=${value}\n`;
  }
  fs.writeFileSync(file, body, { mode: 0o600 });
  return file;
}
if (require.main === module) {
  try { configure(process.cwd(), ...process.argv.slice(2)); console.log('VPS configuration ready. Existing data and credentials were preserved; account sign-in is required.'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { configure };
