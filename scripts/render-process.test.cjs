const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { setTimeout: delay } = require("node:timers/promises");
const { spawnSync } = require("node:child_process");
const { linkEngineModules, runStep } = require("./render-process.cjs");
function fixture(t) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),"whiteboard 中文 空格-"));
  t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return dir;
}
test("native dependency link resolves a package through a deep Unicode/space job path",t=>{
 const root=fixture(t),engine=path.join(root,"data/jobs/测试任务/engine");
 const pkg=path.join(root,"engine/node_modules/fixture-package");fs.mkdirSync(pkg,{recursive:true});fs.mkdirSync(engine,{recursive:true});
 fs.writeFileSync(path.join(pkg,"index.js"),'module.exports = 42;');
 linkEngineModules(root,engine);assert.equal(require(require.resolve("fixture-package",{paths:[engine]})),42);
});
test("Windows branch chooses an absolute junction target (branch simulation, not native NTFS)",t=>{
 const root=fixture(t),engine=path.join(root,"任务/engine");fs.mkdirSync(path.join(root,"engine/node_modules"),{recursive:true});fs.mkdirSync(engine,{recursive:true});
 let selected;linkEngineModules(root,engine,"win32",{existsSync:fs.existsSync,symlinkSync(target,link,type){selected=type;assert(path.isAbsolute(target));fs.symlinkSync(target,link,type);}});
 assert.equal(selected,"junction");assert.equal(fs.realpathSync(path.join(engine,"node_modules")),fs.realpathSync(path.join(root,"engine/node_modules")));
});
test("dependency EPERM retains its cause and actionable error",t=>{
 const root=fixture(t);assert.throws(()=>linkEngineModules(root,root,"win32",{existsSync:()=>true,symlinkSync(){throw Object.assign(new Error("permission denied"),{code:"EPERM"});}}),e=>e.cause.code==="EPERM"&&e.message.includes("目录联接"));
});
test("a cancellation already requested never starts a stage",async t=>{
 const cwd=fixture(t),cancelFile=path.join(cwd,"cancel.requested"),marker=path.join(cwd,"started");fs.writeFileSync(cancelFile,"cancel");
 await assert.rejects(runStep(process.execPath,["-e",`require('fs').writeFileSync(${JSON.stringify(marker)},'bad')`],{cwd,cancelFile}),{code:"RENDER_CANCELLED"});assert(!fs.existsSync(marker));
});
test("active cancellation stops both the stage and its heartbeat grandchild",async t=>{
 const cwd=fixture(t),cancelFile=path.join(cwd,"cancel.requested"),heartbeat=path.join(cwd,"heartbeat");
 const grandchild=`const fs=require('fs');setInterval(()=>fs.writeFileSync(${JSON.stringify(heartbeat)},String(Date.now())),50);`;
 const stage=`require('child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'inherit'});setInterval(()=>{},1000);`;
 const running=runStep(process.execPath,["-e",stage],{cwd,cancelFile,timeoutMs:10000});const rejected=assert.rejects(running,{code:"RENDER_CANCELLED"});
 for(let i=0;i<100&&!fs.existsSync(heartbeat);i++)await delay(50);assert(fs.existsSync(heartbeat));
 fs.writeFileSync(cancelFile,"cancel");await rejected;await delay(150);const stopped=fs.readFileSync(heartbeat,"utf8");await delay(300);assert.equal(fs.readFileSync(heartbeat,"utf8"),stopped);
});
test("stage timeout kills the child instead of leaving it running",async t=>{
 const cwd=fixture(t);await assert.rejects(runStep(process.execPath,["-e","setInterval(()=>{},1000)"],{cwd,cancelFile:path.join(cwd,"cancel.requested"),timeoutMs:100}),/执行超时/);
});

function envProbe(root, cwd, key) {
 const env={...process.env};delete env.MI_TTS_API_KEY;
 if(key!==undefined)env.MI_TTS_API_KEY=key;
 return spawnSync(process.execPath,['-e',`const {loadRenderEnvironment}=require(${JSON.stringify(path.join(__dirname,'render-process.cjs'))});loadRenderEnvironment(${JSON.stringify(root)});process.stdout.write(JSON.stringify({key:process.env.MI_TTS_API_KEY||null}));`],{cwd,env,encoding:'utf8'}); // guard:allow-env-credential — Isolated test child reads only a synthetic fixture key; never a hosted request or real user credential.
}
test("root .env reaches worker even when its job cwd has no .env",t=>{
 const root=fixture(t),job=path.join(root,'data/jobs/隔离引擎');fs.mkdirSync(job,{recursive:true});fs.writeFileSync(path.join(root,'.env'),'# 本地测试凭证\nMI_TTS_API_KEY=qa-file-key\n');
 const r=envProbe(root,job);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).key,'qa-file-key');assert(!fs.existsSync(path.join(job,'.env')));
});
test("inherited operator credential takes precedence over root .env",t=>{
 const root=fixture(t);fs.writeFileSync(path.join(root,'.env'),'MI_TTS_API_KEY=qa-file-key\n');const r=envProbe(root,root,'qa-inherited-key');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).key,'qa-inherited-key');
});
test("missing root .env is allowed when an inherited credential is provided",t=>{
 const root=fixture(t),r=envProbe(root,root,'qa-inherited-key');assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).key,'qa-inherited-key');
});
test("unreadable root .env fails with a local setup error",t=>{
 const root=fixture(t);fs.mkdirSync(path.join(root,'.env'));const r=envProbe(root,root);assert.notEqual(r.status,0);assert(r.stderr.includes('无法读取项目根目录 .env'));
});
