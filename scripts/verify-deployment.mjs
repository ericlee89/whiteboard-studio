// Local acceptance only: self-signed TLS gateway + original app backend.
// Uses a disposable local database, a synthetic user and real free Edge speech.
// Does not deploy to Vercel, contact a paid model, or claim Docker acceptance.
import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import {spawn,spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
const require=createRequire(import.meta.url),{createGateway}=require('./deploy/vercel-gateway.cjs');
const {chromium}=require('../engine/node_modules/playwright');
const root=process.cwd(),out=path.resolve('.tmp/deployment-smoke',String(Date.now()));fs.mkdirSync(out,{recursive:true});
const publicUrl='https://127.0.0.1:4351',backend='http://127.0.0.1:4350';
const secret='local-fixture-transport-'+('x'.repeat(64));
// Optional operator override; otherwise use this installation's Playwright browser.
const browserPath=process.env.WB_TEST_CHROMIUM || chromium.executablePath(); // guard:allow-env-credential — Optional operator-selected browser executable path for this isolated local acceptance test, not a credential.
const inheritedPythonPath=process.env.PYTHONPATH; // guard:allow-env-credential — Inherit an operator-owned Python module search path in the local acceptance child process; contains no model or user credential.
if (!fs.existsSync('.tmp/gateway-test-key.pem') || !fs.existsSync('.tmp/gateway-test-cert.pem')) {
 const cert=spawnSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout','.tmp/gateway-test-key.pem','-out','.tmp/gateway-test-cert.pem','-days','1','-subj','/CN=localhost','-addext','subjectAltName=IP:127.0.0.1,DNS:localhost'],{stdio:'ignore'});
 if(cert.status!==0)throw new Error('Local TLS test requires OpenSSL or pre-created .tmp/gateway-test-{key,cert}.pem files.');
}
const env={...process.env,DO_NOT_TRACK:'1',AGENT_NATIVE_TELEMETRY_DISABLED:'1',NODE_ENV:'development',
 DATABASE_URL:'pglite:'+path.join(out,'db-'+Date.now()),AUTH_DISABLED:'0',LOCAL_SINGLE_USER:'0',
 STUDIO_DEPLOYMENT_MODE:'vercel-backend',STUDIO_GATEWAY_SECRET:secret,APP_URL:publicUrl,
 BETTER_AUTH_SECRET:'fixture-auth-'+('a'.repeat(64)),SECRETS_ENCRYPTION_KEY:'fixture-crypto-'+('b'.repeat(64)),A2A_SECRET:'fixture-a2a-'+('c'.repeat(64)),
 AGENT_NATIVE_ALLOW_LOCAL_FILES_IN_PRODUCTION:'true',PORT:'4350',NITRO_PORT:'4350',HOST:'127.0.0.1',NITRO_HOST:'127.0.0.1',
 WB_CHROMIUM:browserPath,PYTHONPATH:[path.join(root,'.tmp/python-deps'),inheritedPythonPath].filter(Boolean).join(path.delimiter)};
const log=fs.openSync(path.join(out,'server.log'),'a');let app,browser;
const proof={actualVercelDeployment:false,actualDockerRun:false,database:'disposable native PGlite development database',gateway:'self-signed local TLS fixture; HTTP upstream is test-only'};
const gateway=https.createServer({key:fs.readFileSync('.tmp/gateway-test-key.pem'),cert:fs.readFileSync('.tmp/gateway-test-cert.pem')},
 await createGateway({STUDIO_BACKEND_URL:backend,STUDIO_PUBLIC_URL:publicUrl,STUDIO_GATEWAY_SECRET:secret},{allowHttp:true}));
await new Promise(r=>gateway.listen(4351,'127.0.0.1',r));
const start=()=>app=spawn(process.execPath,['node_modules/@agent-native/core/bin/agent-native.js','dev','--host','127.0.0.1','--port','4350'],{cwd:root,env,stdio:['ignore',log,log]});
async function ready(){for(let i=0;i<90;i++){if(app.exitCode!==null)throw new Error('Backend exited early');try{const r=await fetch(backend+'/_agent-native/ping',{headers:{'x-studio-gateway-key':secret},signal:AbortSignal.timeout(3000)});if(r.ok)return;}catch{}await delay(1000);}throw new Error('Backend readiness timeout');}
async function stop(){if(!app||app.exitCode!==null)return;const closed=new Promise(r=>app.once('close',r));app.kill('SIGTERM');await Promise.race([closed,delay(10000).then(()=>{if(app.exitCode===null)app.kill('SIGKILL');})]);}
try{
 start();await ready();proof.backendStarted=true;console.log('CHECK backend ready');
 assert.equal((await fetch(backend+'/_agent-native/ping')).status,403);proof.directBackendDenied=true;
 browser=await chromium.launch({executablePath:browserPath,args:['--no-sandbox','--disable-dev-shm-usage']});
 const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',ignoreHTTPSErrors:true,extraHTTPHeaders:{DNT:'1'}});
 await context.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultNavigationTimeout(120000);page.setDefaultTimeout(90000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(publicUrl,{waitUntil:'domcontentloaded'});
 const anonymous=await page.request.get(publicUrl+'/_agent-native/actions/list-episodes');assert([401,403].includes(anonymous.status()));proof.anonymousDenied=true;
 const email='deploy-qa-'+Date.now()+'@example.test',password='Local-fixture-QA-42!';
 let r=await page.request.post(publicUrl+'/_agent-native/auth/register',{headers:{Origin:publicUrl},data:{email,password}});assert(r.ok(),await r.text());
 r=await page.request.post(publicUrl+'/_agent-native/auth/login',{headers:{Origin:publicUrl},data:{email,password}});assert(r.ok(),await r.text());
 proof.accountLoginThroughGateway=true;console.log('CHECK account login through gateway');
 await page.goto(publicUrl+'/studio',{waitUntil:'domcontentloaded'});await page.locator('#scene-title').waitFor();proof.authenticatedLanding=true;console.log('CHECK authenticated landing');
 await page.getByRole('button',{name:'新建视频',exact:true}).click();await page.locator('#project-title').fill('双平台部署验证');await page.getByRole('button',{name:'创建项目',exact:true}).click();
 await page.waitForURL(u=>u.searchParams.has('id'));const id=new URL(page.url()).searchParams.get('id');await page.waitForFunction(()=>document.querySelector('#scene-title')?.value==='双平台部署验证');await delay(500);
 await page.locator('#narration').fill('同一套代码，支持两种部署方式。|保存项目后，生成白板视频。');await page.locator('#points').fill('两种部署方式\n统一生成视频');
 const saved=page.waitForResponse(r=>r.url().includes('/actions/save-episode')&&r.request().method()==='POST');await page.getByRole('button',{name:'保存修改',exact:true}).click();assert((await saved).ok());await delay(800);proof.savedThroughGateway=true;
 const status=async()=>(await page.request.get(publicUrl+'/_agent-native/actions/render-status?id='+id)).json();
 const launch=async()=>{const r=page.waitForResponse(r=>r.url().includes('/actions/start-render')&&r.request().method()==='POST');await page.getByRole('button',{name:'一键出片',exact:true}).click();assert((await r).ok());};
 await launch();const duplicate=await page.request.post(publicUrl+'/_agent-native/actions/start-render',{headers:{Origin:publicUrl},data:{id,mode:'build'}});assert.equal(duplicate.status(),409);proof.overlapRejected=true;
 await page.getByRole('button',{name:'取消任务',exact:true}).click();let s;for(let i=0;i<60;i++){s=await status();if(s.state!=='running')break;await delay(300);}assert.equal(s.stage,'任务已取消，可重新出片');proof.cancelled=true;await delay(800);
 await launch();let last='';for(let i=0;i<180;i++){s=await status();if(s.stage!==last){console.log('STAGE',s.state,s.stage);last=s.stage;}if(s.state!=='running')break;await delay(2000);}assert.equal(s.state,'done',s.log);proof.rendered=true;
 const final=s.files.find(f=>f.name==='final.mp4');assert(final);
 const file=await page.request.get(publicUrl+final.url);assert(file.ok());fs.writeFileSync(path.join(out,'final.mp4'),await file.body());proof.downloaded=true;
 const ranged=await page.request.get(publicUrl+final.url,{headers:{Range:'bytes=0-31'}});assert.equal(ranged.status(),206);assert.equal((await ranged.body()).length,32);proof.mediaRange=true;
 await page.goto(publicUrl+final.url,{waitUntil:'domcontentloaded'});await page.locator('video').evaluate(v=>v.play());await delay(1500);
 proof.playback=await page.locator('video').evaluate(v=>({time:v.currentTime,width:v.videoWidth,height:v.videoHeight,error:v.error?.message||null}));assert(proof.playback.time>0&&!proof.playback.error);
 for(const f of s.files.filter(f=>/封面-|字幕.srt/.test(f.name))){assert((await page.request.get(publicUrl+f.url)).ok());}proof.coversAndSubtitles=true;
 await page.goto(publicUrl+'/studio?id='+id,{waitUntil:'domcontentloaded'});await page.locator('#scene-title').waitFor();assert.equal(await page.locator('#scene-title').inputValue(),'双平台部署验证');proof.projectReadback=true;
 proof.pageErrors=errors;assert.equal(errors.length,0);proof.completed=true;
 console.log('DEPLOYMENT_SMOKE_PASSED',JSON.stringify(proof));
}catch(error){proof.completed=false;proof.failure=String(error);console.error(error);process.exitCode=1;}
finally{await browser?.close();await stop();gateway.closeAllConnections();gateway.close();fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(proof,null,2));fs.closeSync(log);}
