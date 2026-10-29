const http = require('node:http');
const https = require('node:https');
const HOP = new Set(['connection','keep-alive','proxy-authenticate','proxy-authorization','te','trailer','transfer-encoding','upgrade']);
function cleaned(headers) {
  const banned = new Set([...HOP, ...String(headers.connection || '').toLowerCase().split(',').map(x => x.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([k]) => !banned.has(k.toLowerCase())));
}
function failure(res, status, code) {
  if (res.headersSent) { res.destroy(); return; }
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'});
  res.end(JSON.stringify({ error: code }));
}
async function createGateway(env = process.env, { allowHttp = false } = {}) {
  // Vercel's Node launcher can disable require(ESM), even on Node 22.
  const { gatewayConfig } = await import('./deployment-config.mjs');
  const cfg = gatewayConfig(env, allowHttp);
  return function gateway(req, res) {
    // Never use user-controlled URLs or forwarding headers as an upstream.
    if (req.headers.host !== cfg.publicUrl.host) return failure(res, 421, 'PUBLIC_HOST_MISMATCH');
    if (!req.url?.startsWith('/') || req.url.startsWith('//') || req.url.includes('\\'))
      return failure(res, 400, 'INVALID_REQUEST_PATH');
    if (req.headers.upgrade) return failure(res, 426, 'WEBSOCKET_NOT_SUPPORTED');
    const headers = cleaned(req.headers);
    for (const name of Object.keys(headers)) {
      if (name.startsWith('x-forwarded-') || name.startsWith('x-studio-') || name === 'forwarded') delete headers[name];
    }
    headers.host = cfg.backend.host;
    headers['x-studio-gateway-key'] = cfg.secret;
    headers['accept-encoding'] = 'identity';
    const transport = cfg.backend.protocol === 'https:' ? https : http;
    let incoming;
    const outgoing = transport.request({
      protocol: cfg.backend.protocol, hostname: cfg.backend.hostname, port: cfg.backend.port || undefined,
      method: req.method, path: req.url, headers, timeout: 240000,
    }, upstream => {
      incoming = upstream;
      const responseHeaders = cleaned(upstream.headers);
      delete responseHeaders['x-studio-gateway-key'];
      if (responseHeaders.location) {
        try {
          const destination = new URL(responseHeaders.location, cfg.backend);
          if (destination.origin === cfg.backend.origin) {
            destination.protocol = cfg.publicUrl.protocol; destination.host = cfg.publicUrl.host;
            responseHeaders.location = destination.href;
          }
        } catch { /* Preserve non-URL values; do not follow redirects in the gateway. */ }
      }
      // Host-only cookies retain their browser origin. An explicit backend cookie
      // domain is removed so auth also works behind a custom Vercel domain.
      if (responseHeaders['set-cookie']) responseHeaders['set-cookie'] = responseHeaders['set-cookie'].map(cookie =>
        cookie.replace(/;\s*domain=[^;]*/ig, ''));
      // Authenticated HTML/API/media must never enter a shared CDN cache.
      responseHeaders['cache-control'] = 'private, no-store';
      res.writeHead(upstream.statusCode || 502, responseHeaders);
      res.flushHeaders();
      upstream.once('error', () => res.destroy());
      upstream.pipe(res);
    });
    outgoing.once('timeout', () => outgoing.destroy(new Error('UPSTREAM_TIMEOUT')));
    outgoing.once('error', () => failure(res, 502, 'BACKEND_UNAVAILABLE'));
    req.once('aborted', () => outgoing.destroy());
    res.once('close', () => { if (!res.writableEnded) { outgoing.destroy(); incoming?.destroy(); } });
    req.pipe(outgoing);
  };
}
function unconfigured(req, res) {
  if (!['GET','HEAD'].includes(req.method) || !String(req.headers.accept || '').includes('text/html'))
    return failure(res, 503, 'GATEWAY_NOT_CONFIGURED');
  res.writeHead(503, {'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store',
    'Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    'Referrer-Policy':'no-referrer'});
  if (req.method === 'HEAD') return res.end();
  res.end(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>白板工作室 · 后端待配置</title><style>body{margin:0;background:#f4f5ef;color:#293129;font:16px/1.8 system-ui,sans-serif}main{max-width:680px;margin:10vh auto;padding:40px;background:white;border:1px solid #dce2d3;border-radius:20px}small{color:#728452}h1{font-size:30px;margin:12px 0}code{font:14px monospace;background:#eef1e7;padding:4px 8px;border-radius:5px}li{margin:12px 0}footer{margin-top:30px;color:#70796d;font-size:14px}@media(max-width:740px){main{margin:24px;padding:26px}}</style><main><small>WHITEBOARD STUDIO</small><h1>网站入口已发布，后端待配置</h1><p>当前 Vercel 部署尚未连接 VPS 后端，暂时无法登录、保存项目或生成视频。</p><p>请在 Vercel 项目的环境变量中配置：</p><ul><li><code>STUDIO_BACKEND_URL</code>：VPS 后端的 HTTPS 地址</li><li><code>STUDIO_PUBLIC_URL</code>：这个网站的固定公开地址</li><li><code>STUDIO_GATEWAY_SECRET</code>：与 VPS 后端一致的网关密钥</li></ul><p>后端的 <code>APP_URL</code> 须与网站公开地址一致。配置完成后重新部署。</p><footer>项目数据、模型调用和视频生成由 VPS 执行。请通过部署平台配置密钥，不要在聊天中发送密钥。</footer></main></html>`);
}
function createHandler(env = process.env) {
  let singleton;
  return async function handler(req, res) {
    let gateway;
    try { singleton ||= createGateway(env); gateway = await singleton; }
    catch { singleton = undefined; return unconfigured(req, res); }
    return new Promise(resolve => {
      res.once('finish', resolve);
      res.once('close', resolve);
      gateway(req, res);
    });
  };
}
module.exports = createHandler();
module.exports.createGateway = createGateway;
module.exports.createHandler = createHandler;
