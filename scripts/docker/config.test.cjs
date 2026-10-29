const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { initialize } = require("./init-env.cjs");
const { verifyDeployment, recoverInterruptedJobs } = require("./entrypoint.cjs");
function fixture(t) { const dir=fs.mkdtempSync(path.join(os.tmpdir(),'whiteboard-docker-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir; }
test('initialize generates distinct deployment secrets and preserves existing provider settings',t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'.env.docker.example'),'POSTGRES_PASSWORD=\nBETTER_AUTH_SECRET=\nSECRETS_ENCRYPTION_KEY=\nMI_TTS_API_KEY=qa-placeholder\n');
 initialize(root);const value=fs.readFileSync(path.join(root,'.env.docker'),'utf8');const matches=[...value.matchAll(/^(POSTGRES_PASSWORD|BETTER_AUTH_SECRET|SECRETS_ENCRYPTION_KEY|A2A_SECRET|STUDIO_GATEWAY_SECRET)=([a-f0-9]{64})$/gm)];assert.equal(matches.length,5);assert.equal(new Set(matches.map(m=>m[2])).size,5);assert(value.includes('MI_TTS_API_KEY=qa-placeholder'));
});
test('initialize is idempotent so redeploying does not rotate database or encryption keys',t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'.env.docker.example'),'');initialize(root);const first=fs.readFileSync(path.join(root,'.env.docker'),'utf8');initialize(root);assert.equal(fs.readFileSync(path.join(root,'.env.docker'),'utf8'),first);
});
test('production preflight refuses the development PGlite URL',()=>{assert.throws(()=>verifyDeployment({DATABASE_URL:'pglite:/tmp/dev'}),/PostgreSQL/);});
test('production preflight refuses missing stable signing/encryption keys',()=>{assert.throws(()=>verifyDeployment({DATABASE_URL:'postgresql://example/db'}),/BETTER_AUTH_SECRET/);});
test('restart recovery clears only interrupted jobs and keeps finished outputs',t=>{
 const root=fixture(t),dir=path.join(root,'data/jobs/owner/project'),job='job-1';fs.mkdirSync(path.join(dir,job),{recursive:true});fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify({job,pid:process.pid}));fs.writeFileSync(path.join(dir,job,'status.json'),JSON.stringify({state:'running',mode:'build'}));fs.writeFileSync(path.join(dir,'lock'),job);
 assert.equal(recoverInterruptedJobs(root),1);assert.equal(JSON.parse(fs.readFileSync(path.join(dir,job,'status.json'),'utf8')).state,'failed');assert(!fs.existsSync(path.join(dir,'lock')));assert.equal(recoverInterruptedJobs(root),0);
});
test('restart recovery ignores malformed job paths',t=>{
 const root=fixture(t),dir=path.join(root,'data/jobs/owner/project');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify({job:'../../escape'}));assert.equal(recoverInterruptedJobs(root),0);
});
