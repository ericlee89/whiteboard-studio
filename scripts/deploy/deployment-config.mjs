import { timingSafeEqual } from 'node:crypto';

function origin(value, name, allowHttp = false) {
  let url;
  try { url = new URL(value); } catch { throw new Error(`${name} must be an absolute URL.`); }
  if ((!allowHttp && url.protocol !== 'https:') ||
      (allowHttp && !['http:', 'https:'].includes(url.protocol)) ||
      url.username || url.password || url.search || url.hash || url.pathname !== '/')
    throw new Error(`${name} must be an HTTPS origin without credentials, a path or query.`);
  return url;
}
function deployment(env = process.env) {
  const mode = env.STUDIO_DEPLOYMENT_MODE || 'local';
  if (!['local', 'vps', 'vercel-backend'].includes(mode)) throw new Error('Unknown STUDIO_DEPLOYMENT_MODE.');
  const required = mode === 'vercel-backend';
  const secret = env.STUDIO_GATEWAY_SECRET || '';
  const publicUrl = mode === 'local' ? null : origin(env.APP_URL, 'APP_URL');
  if (mode !== 'local' && (["1", "true"].includes(env.AUTH_DISABLED) || env.LOCAL_SINGLE_USER === '1'))
    throw new Error('Public deployments require LOCAL_SINGLE_USER=0 and AUTH_DISABLED=0.');
  if (required && secret.length < 32) throw new Error('Vercel backend requires STUDIO_GATEWAY_SECRET with at least 32 characters.');
  return { mode, required, secret, publicUrl };
}
function gatewayConfig(env = process.env, allowHttp = false) {
  const backend = origin(env.STUDIO_BACKEND_URL, 'STUDIO_BACKEND_URL', allowHttp);
  const publicUrl = origin(env.STUDIO_PUBLIC_URL, 'STUDIO_PUBLIC_URL', allowHttp);
  if (backend.origin === publicUrl.origin) throw new Error('Backend and public URL must differ to avoid a proxy loop.');
  const secret = env.STUDIO_GATEWAY_SECRET || '';
  if (secret.length < 32) throw new Error('STUDIO_GATEWAY_SECRET must contain at least 32 characters.');
  return { backend, publicUrl, secret };
}
function sameSecret(actual, expected) {
  const a = Buffer.from(actual || ''), b = Buffer.from(expected || '');
  return b.length >= 32 && a.length === b.length && timingSafeEqual(a, b);
}
export { deployment, gatewayConfig, sameSecret, origin };
export default { deployment, gatewayConfig, sameSecret, origin };
