const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');
const { createGateway, createHandler } = require('./vercel-gateway.cjs');
const { deployment, gatewayConfig } = require('./deployment-config.mjs');
const { configure } = require('./init-vps.cjs');
const { build } = require('./build-vercel.cjs');
const secret = 'test-only-deployment-transport-' + 'x'.repeat(40);
// Node's fetch rewrites Host; raw HTTP preserves the virtual host a browser
// would send to Vercel while these fixture servers listen on loopback.
function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method: options.method || 'GET', headers: options.headers }, incoming => {
      const headers = new Headers();
      for (let i=0;i<incoming.rawHeaders.length;i+=2) headers.append(incoming.rawHeaders[i],incoming.rawHeaders[i+1]);
      resolve(new Response(Readable.toWeb(incoming), { status: incoming.statusCode, headers }));
    });
    req.on('error', reject);req.end(options.body);
  });
}
async function server(t, listener) {
  const s = http.createServer(listener);
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  t.after(() => { s.closeAllConnections(); s.close(); });
  return `http://127.0.0.1:${s.address().port}`;
}
test('public deployment fails closed on disabled auth, invalid origins and missing gateway keys', () => {
  assert.throws(() => deployment({STUDIO_DEPLOYMENT_MODE:'vercel-backend',APP_URL:'https://studio.example.com',AUTH_DISABLED:'1'}), /sign-in|LOCAL_SINGLE_USER/);
  assert.throws(() => deployment({STUDIO_DEPLOYMENT_MODE:'vercel-backend',APP_URL:'https://studio.example.com'}), /GATEWAY_SECRET/);
  assert.throws(() => gatewayConfig({STUDIO_BACKEND_URL:'http://localhost',STUDIO_PUBLIC_URL:'https://studio.example.com',STUDIO_GATEWAY_SECRET:secret}), /HTTPS/);
  assert.throws(() => gatewayConfig({STUDIO_BACKEND_URL:'https://studio.example.com',STUDIO_PUBLIC_URL:'https://studio.example.com',STUDIO_GATEWAY_SECRET:secret}), /loop/);
});
test('VPS initialization preserves stable secrets and switches public mode to real accounts', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'studio-deploy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.writeFileSync(path.join(root,'.env.docker.example'),'LOCAL_SINGLE_USER=1\nMI_TTS_API_KEY=fixture-kept\n');
  configure(root,'vercel-backend','render.example.com','https://studio.example.com');
  const file=path.join(root,'.env.docker'),first=fs.readFileSync(file,'utf8');
  assert(first.includes('LOCAL_SINGLE_USER=0'));assert(first.includes('AUTH_DISABLED=0'));assert(first.includes('MI_TTS_API_KEY=fixture-kept'));
  configure(root,'vercel-backend','render.example.com','https://studio.example.com');assert.equal(fs.readFileSync(file,'utf8'),first);
});
test('Vercel output includes only a streaming gateway and embeds no environment values', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-vercel-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'scripts/deploy'),{recursive:true});
  for(const name of ['deployment-config.mjs','vercel-gateway.cjs'])fs.copyFileSync(path.join(__dirname,name),path.join(root,'scripts/deploy',name));
  const output=build(root,{STUDIO_BACKEND_URL:'https://render.example.com',STUDIO_PUBLIC_URL:'https://studio.example.com',STUDIO_GATEWAY_SECRET:secret});
  const dir=path.join(output,'functions/studio-gateway.func'),names=fs.readdirSync(dir);
  assert.deepEqual(names.sort(),['.vc-config.json','deployment-config.mjs','vercel-gateway.cjs'].sort());
  const config=JSON.parse(fs.readFileSync(path.join(dir,'.vc-config.json')));assert(config.supportsResponseStreaming);assert.equal(config.shouldAddHelpers,false);
  for(const file of names)assert(!fs.readFileSync(path.join(dir,file),'utf8').includes(secret));
});
test('first deployment builds without backend settings, but partial settings must validate', t => {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'studio-first-deploy-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'scripts/deploy'),{recursive:true});
  for(const name of ['deployment-config.mjs','vercel-gateway.cjs'])fs.copyFileSync(path.join(__dirname,name),path.join(root,'scripts/deploy',name));
  assert(fs.existsSync(path.join(build(root,{}),'config.json')));
  assert.throws(()=>build(root,{STUDIO_BACKEND_URL:'https://render.example.com'}),/STUDIO_PUBLIC_URL/);
});
test('unconfigured runtime displays setup status and refuses API requests with 503', async t => {
  const gateway=await server(t,createHandler({}));
  const page=await request(gateway,{headers:{accept:'text/html'}});
  assert.equal(page.status,503);assert.match(await page.text(),/后端待配置/);
  const api=await request(gateway+'/_agent-native/actions/start-render',{method:'POST',body:'{}'});
  assert.equal(api.status,503);assert.deepEqual(await api.json(),{error:'GATEWAY_NOT_CONFIGURED'});
});
test('configured public handler initializes asynchronously before enforcing its host', async t => {
  const gateway=await server(t,createHandler({STUDIO_BACKEND_URL:'https://render.example.com',STUDIO_PUBLIC_URL:'https://studio.example.com',STUDIO_GATEWAY_SECRET:secret}));
  const r=await request(gateway);
  assert.equal(r.status,421);assert.deepEqual(await r.json(),{error:'PUBLIC_HOST_MISMATCH'});
});
test('gateway loads when synchronous require of ESM is disabled by the platform', () => {
  const program="const g=require(process.argv[1]);g.createGateway({STUDIO_BACKEND_URL:'https://render.example.com',STUDIO_PUBLIC_URL:'https://studio.example.com',STUDIO_GATEWAY_SECRET:'fixture-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'}).then(()=>console.log('loaded')).catch(()=>process.exit(1))";
  assert.equal(execFileSync(process.execPath,['--no-experimental-require-module','-e',program,path.join(__dirname,'vercel-gateway.cjs')],{encoding:'utf8'}).trim(),'loaded');
});
test('gateway preserves request body/cookies/range and scrubs spoofed transport headers', async t => {
  const backend=await server(t,async(req,res)=>{
    const body=[];for await(const chunk of req)body.push(chunk);
    assert.equal(req.headers['x-studio-gateway-key'],secret);assert.equal(req.headers['x-forwarded-host'],undefined);
    assert.equal(req.headers.cookie,'session=fixture');assert.equal(req.headers.range,'bytes=2-5');
    assert.equal(req.headers.origin,'https://studio.example.com');
    res.writeHead(200,{'content-type':'application/json','set-cookie':['session=new; Domain=render.example.com; HttpOnly; Secure; SameSite=Lax','other=ok; Path=/'],'x-studio-gateway-key':'must-not-escape'});
    res.end(JSON.stringify({url:req.url,body:Buffer.concat(body).toString()}));
  });
  const gateway=await server(t,await createGateway({STUDIO_BACKEND_URL:backend,STUDIO_PUBLIC_URL:'https://studio.example.com',STUDIO_GATEWAY_SECRET:secret},{allowHttp:true}));
  const r=await request(gateway+'/custom-model-provider?label=%E4%B8%AD%E6%96%87',{method:'POST',headers:{host:'studio.example.com',cookie:'session=fixture',range:'bytes=2-5',origin:'https://studio.example.com','x-forwarded-host':'attacker.example','x-studio-gateway-key':'spoof'},body:'{"text":"中文"}'});
  assert.equal(r.status,200);assert.equal(r.headers.get('x-studio-gateway-key'),null);assert.equal(r.headers.get('cache-control'),'private, no-store');
  assert(!r.headers.get('set-cookie').toLowerCase().includes('domain='));assert.equal(r.headers.getSetCookie().length,2);
  assert.deepEqual(await r.json(),{url:'/custom-model-provider?label=%E4%B8%AD%E6%96%87',body:'{"text":"中文"}'});
});
test('gateway streams SSE before completion and forwards 206 media without buffering', async t => {
  let finishSse;
  const backend=await server(t,(req,res)=>{
    if(req.url==='/events') {res.writeHead(200,{'content-type':'text/event-stream'});res.write('data: first\n\n');finishSse=()=>res.end('data: last\n\n');}
    else {res.writeHead(206,{'content-type':'video/mp4','content-range':'bytes 2-5/10','accept-ranges':'bytes'});res.end('2345');}
  });
  const gateway=await server(t,await createGateway({STUDIO_BACKEND_URL:backend,STUDIO_PUBLIC_URL:'https://studio.example.com',STUDIO_GATEWAY_SECRET:secret},{allowHttp:true}));
  const r=await request(gateway+'/events',{headers:{host:'studio.example.com'}});const reader=r.body.getReader();
  assert.equal(new TextDecoder().decode((await reader.read()).value),'data: first\n\n');finishSse();
  assert.equal(new TextDecoder().decode((await reader.read()).value),'data: last\n\n');await reader.cancel();
  const media=await request(gateway+'/video',{headers:{host:'studio.example.com',range:'bytes=2-5'}});
  assert.equal(media.status,206);assert.equal(media.headers.get('content-range'),'bytes 2-5/10');assert.equal(await media.text(),'2345');
});
test('wrong host and upstream failure produce bounded errors without secrets', async t => {
  const gateway=await server(t,await createGateway({STUDIO_BACKEND_URL:'http://127.0.0.1:9',STUDIO_PUBLIC_URL:'https://studio.example.com',STUDIO_GATEWAY_SECRET:secret},{allowHttp:true}));
  assert.equal((await request(gateway)).status,421);
  const r=await request(gateway,{headers:{host:'studio.example.com'}});assert.equal(r.status,502);
  assert.deepEqual(await r.json(),{error:'BACKEND_UNAVAILABLE'});
});
