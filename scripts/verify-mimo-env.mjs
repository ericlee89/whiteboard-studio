// Integration fixture: local synthetic audio only, no real MiMo request or paid key.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../engine/node_modules/playwright');
const app=process.cwd(),out=path.resolve('.tmp/mimo-env'),root=path.join(out,'应用 中文 空格');fs.mkdirSync(root,{recursive:true});
const nodeModules=path.join(root,'engine');if(!fs.existsSync(nodeModules))fs.symlinkSync(path.join(app,'engine'),nodeModules,process.platform==='win32'?'junction':'dir');
const wav=path.join(out,'fixture.wav');execFileSync('ffmpeg',['-y','-v','error','-f','lavfi','-i','sine=frequency=440:duration=1.2','-ar','24000','-ac','1',wav]);
const audio=fs.readFileSync(wav).toString('base64'),seen=[];
const mock=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
 seen.push({path:req.url,authorized:req.headers.authorization==='Bearer qa-mimo-file-secret',model:body.model,voice:body.audio?.voice,assistantNarration:body.messages?.some(m=>m.role==='assistant'&&m.content==='配置读取测试。')});
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',audio:{data:audio}}}]}));
});
await new Promise(r=>mock.listen(0,'127.0.0.1',r));const port=mock.address().port;
const cached=path.resolve('.tmp/chrome145/chrome-headless-shell-linux64/chrome-headless-shell');const browser=process.env.WB_QA_CHROMIUM||(fs.existsSync(cached)?cached:chromium.executablePath()); // guard:allow-env-credential — Operator-owned local browser executable for a test CLI; no hosted request or provider credentials.
fs.writeFileSync(path.join(root,'.env'),`MI_TTS_API_KEY=qa-mimo-file-secret\nMI_TTS_BASE_URL=http://127.0.0.1:${port}/v1\nWB_CHROMIUM=${browser}\n`);
const job=path.join(root,'data/jobs/fixture');fs.mkdirSync(job,{recursive:true});fs.writeFileSync(path.join(job,'episode.json'),JSON.stringify({id:'mimo-env-check',title:'配置读取测试',engine:'mi',voice:'冰糖',speed:1,brand:'白板工作室',highlight:true,sources:'本地配置读取测试',publish:'测试，不发布',scenes:[{title:'配置读取测试',narration:'配置读取测试。',points:['根目录配置已传递']}]}));
const env={...process.env};for(const k of ['MI_TTS_API_KEY','MI_TTS_BASE_URL','MI_TTS_MODEL','MI_TTS_VOICE','WB_CHROMIUM','TTS_ENGINE'])delete env[k];
const log=fs.openSync(path.join(out,'runner.log'),'w');
try{
 const child=spawn(process.execPath,[path.join(app,'scripts/render-episode.cjs'),job,'build'],{cwd:root,env,stdio:['ignore',log,log]});
 const code=await new Promise((resolve,reject)=>{child.on('error',reject);child.on('close',resolve);});assert.equal(code,0,fs.readFileSync(path.join(out,'runner.log'),'utf8').slice(-2000));
 const status=JSON.parse(fs.readFileSync(path.join(job,'status.json'),'utf8'));assert.equal(status.state,'done');assert.equal(seen.length,1);assert(seen.every(r=>r.authorized&&r.assistantNarration&&r.path==='/v1/chat/completions'));
 const mp4=path.join(job,'engine/build/mimo-env-check/outputs/final.mp4');assert(fs.statSync(mp4).size>0);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',mp4]));execFileSync('ffmpeg',['-v','error','-i',mp4,'-f','null','-']);
 function scan(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isSymbolicLink())continue;if(e.isDirectory())scan(p);else{assert.notEqual(e.name,'.env');assert(!fs.readFileSync(p).includes(Buffer.from('qa-mimo-file-secret')),'Credential was copied into job output');}}}
 scan(job);
 const report={completed:true,environment:process.platform,realMimoTested:false,audio:'synthetic sine-wave fixture; not real speech',rootEnvLoaded:true,inheritedKeyInitiallyAbsent:true,request:seen[0],jobContainsEnvOrPlaintextKey:false,state:status.state,duration:Number(probe.format.duration),video:probe.streams.find(s=>s.codec_type==='video').codec_name,audioCodec:probe.streams.find(s=>s.codec_type==='audio').codec_name,decode:'passed'};
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2));console.log('MIMO_ENV_FLOW_PASSED',JSON.stringify(report));
}finally{fs.closeSync(log);mock.closeAllConnections();await new Promise(r=>mock.close(r));}
