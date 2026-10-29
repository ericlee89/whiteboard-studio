const fs = require('node:fs');
const path = require('node:path');
const { gatewayConfig } = require('./deployment-config.mjs');
function build(root = path.resolve(__dirname, '../..'), env = process.env) {
  // The first deployment may precede backend setup. Runtime remains closed
  // with HTTP 503 until all three settings are present and valid.
  const configured = ['STUDIO_BACKEND_URL','STUDIO_PUBLIC_URL','STUDIO_GATEWAY_SECRET'].some(key => env[key]);
  if (configured) gatewayConfig(env);
  else console.log('Backend settings are absent; deploying the backend-setup status page.');
  const output = path.join(root, '.vercel/output');
  fs.rmSync(output, { recursive: true, force: true });
  const fn = path.join(output, 'functions/studio-gateway.func');
  fs.mkdirSync(fn, { recursive: true });
  for (const name of ['vercel-gateway.cjs', 'deployment-config.mjs'])
    fs.copyFileSync(path.join(root, 'scripts/deploy', name), path.join(fn, name));
  fs.writeFileSync(path.join(fn, '.vc-config.json'), JSON.stringify({
    runtime: 'nodejs22.x', handler: 'vercel-gateway.cjs', launcherType: 'Nodejs',
    shouldAddHelpers: false, supportsResponseStreaming: true, maxDuration: 300,
  }, null, 2));
  fs.writeFileSync(path.join(output, 'config.json'), JSON.stringify({
    version: 3, routes: [{ src: '/(.*)', dest: '/studio-gateway' }],
  }, null, 2));
  console.log('Vercel streaming gateway built. Application state and rendering stay on the configured VPS backend.');
  return output;
}
if (require.main === module) { try { build(); } catch (error) { console.error(error.message); process.exitCode = 1; } }
module.exports = { build };
