// Local integration fixture. No real model key, external model request, or production data.
import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,open,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('../engine/node_modules/playwright');
const out=path.resolve('.tmp/model-chat');await mkdir(out,{recursive:true});
const origin='http://127.0.0.1:4341',endpoint='http://127.0.0.1:4340/v1';
const modelId='qa-whiteboard-model',key='qa-local-fixture-not-a-real-key';
const requests=[],errors=[],checks={fixture:true,realProviderTested:false};
const mock=http.createServer(async(req,res)=>{
 let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
 const received=(body.messages||[]).find(m=>m.role==='tool'&&m.tool_call_id==='qa-list-43');
 const record={path:req.url,method:req.method,model:body.model,stream:body.stream,authorized:req.headers.authorization===`Bearer ${key}`,tools:(body.tools||[]).map(t=>t.function?.name),toolResultReceived:!!received,hasEpisodeData:!!received&&JSON.stringify(received).includes('sample-whiteboard')};requests.push(record);
 console.log('MOCK_REQUEST',JSON.stringify(record));
 if(req.url==='/v1/models'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({object:'list',data:[{id:modelId,object:'model',created:1,owned_by:'local-qa'}]}));return;}
 if(req.url!=='/v1/chat/completions'){res.writeHead(404);res.end('Unknown local fixture route');return;}
 assert.equal(body.model,modelId);assert.equal(record.authorized,true);
 const toolMode=JSON.stringify((body.messages||[]).filter(m=>m.role==='user').at(-1)||'').includes('只读工具验收');
 const callTool=toolMode&&!received&&(body.tools||[]).some(t=>t.function?.name==='list-episodes');
 const message=toolMode&&received?'MODEL_QA_TOOL_43 已收到 list-episodes 的真实工具结果（本地测试响应）。':'MODEL_QA_REPLY_42 自定义接口传输通过（本地测试响应）。';
 if(body.stream){res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache','Connection':'keep-alive'});
  const chunk=(delta,finish_reason=null)=>({id:'chatcmpl-qa',object:'chat.completion.chunk',created:1,model:modelId,choices:[{index:0,delta,finish_reason}]});
  res.write('data: '+JSON.stringify(chunk({role:'assistant',content:''}))+'\n\n');
  if(callTool){
   res.write('data: '+JSON.stringify(chunk({tool_calls:[{index:0,id:'qa-list-43',type:'function',function:{name:'list-episodes',arguments:'{}'}}]}))+'\n\n');
   res.write('data: '+JSON.stringify(chunk({},'tool_calls'))+'\n\n');
  }else{
   res.write('data: '+JSON.stringify(chunk({content:message}))+'\n\n');res.write('data: '+JSON.stringify(chunk({},'stop'))+'\n\n');
  }res.end('data: [DONE]\n\n');
 }else {res.setHeader('Content-Type','application/json');res.end(JSON.stringify({id:'chatcmpl-qa',object:'chat.completion',created:1,model:modelId,choices:[{index:0,message:{role:'assistant',content:message},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:20,total_tokens:30}}));}
});
await new Promise(resolve=>mock.listen(4340,'127.0.0.1',resolve));
const log=await open(path.join(out,'server.log'),'a');
// Operator-owned local endpoint is deliberately set only for this isolated test process.
// Framework URL/redirect guards remain enabled; no private-network bypass is added to the app.
const server=spawn(process.execPath,['node_modules/@agent-native/core/bin/agent-native.js','dev','--host','127.0.0.1','--port','4341'],{stdio:['ignore',log.fd,log.fd],env:{...process.env,AUTH_DISABLED:'1',DATABASE_URL:'pglite:'+path.join(out,'db-'+Date.now()),OPENAI_API_KEY:key,OPENAI_BASE_URL:endpoint}});
let browser,page;
try{
 let ready=false;for(let i=0;i<90;i++){try{if((await fetch(origin,{signal:AbortSignal.timeout(3000)})).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}assert(ready,'Server start timeout');
 const cachedBrowser=path.resolve('.tmp/chrome145/chrome-headless-shell-linux64/chrome-headless-shell');
 const executablePath=process.env.WB_QA_CHROMIUM||(existsSync(cachedBrowser)?cachedBrowser:undefined); // guard:allow-env-credential — Operator-owned local QA browser path; not a hosted request or user credential.
 browser=await chromium.launch({...(executablePath?{executablePath}:{}),args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 page=await browser.newPage({viewport:{width:1440,height:1000},locale:'zh-CN'});page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/settings/model',{waitUntil:'load',timeout:120000});
 const add=page.getByRole('button',{name:/^(Add provider|添加提供商)$/}).first();await add.click({timeout:90000});
 const d=page.getByRole('dialog');await d.getByRole('combobox').click();await page.getByRole('option',{name:'自定义（OpenAI 兼容）',exact:true}).click();
 await d.getByLabel(/API key|API 密钥/i).fill(key);await d.locator('input[type="url"]').fill(endpoint);await d.getByLabel('模型 ID',{exact:true}).fill(modelId);await d.getByLabel('显示名称',{exact:true}).fill('本地接入测试');
 await page.screenshot({path:path.join(out,'01-provider-form.png')});
 const saving=page.waitForResponse(r=>r.url().endsWith('/custom-model-provider')&&r.request().method()==='POST');await d.getByRole('button',{name:/^(Add provider|添加提供商)$/}).click();
 const savedResponse=await saving;assert(savedResponse.ok(),await savedResponse.text());checks.save=await savedResponse.json();assert.equal(checks.save.modelId,modelId);assert(!JSON.stringify(checks.save).includes(key));
 await d.waitFor({state:'hidden'});checks.scope=checks.save.scope;
 const get=async(p)=>(await page.request.get(origin+p)).json();
 checks.metadata=await get('/_agent-native/actions/get-custom-model-settings?scope='+checks.scope);
 const models=await get('/_agent-native/actions/get-provider-models?provider=openai&scope='+checks.scope);assert(JSON.stringify(models).includes(modelId));checks.selectionPersisted=true;
 const cross=await page.request.post(origin+'/custom-model-provider',{headers:{Origin:'https://other.example'},data:{}});assert.equal(cross.status(),403);checks.crossOriginDenied=true;
 const invalid=await page.request.post(origin+'/custom-model-provider',{headers:{Origin:origin},data:{scope:'user',apiKey:key,baseUrl:'https://name:secret@example.com/v1',modelId:'qa',label:'invalid'}});assert.equal(invalid.status(),400);checks.urlCredentialsDenied=true;
 await page.goto(origin+'/chat',{waitUntil:'load',timeout:120000});
 const composer=page.locator('[contenteditable="true"]').first();await composer.waitFor({timeout:90000});await page.waitForTimeout(2000);
 await page.locator('[data-agent-composer-slot="model-button"]').first().click();
 let row=page.locator(`[data-agent-composer-model-row="${modelId}"]`);
 if(!await row.isVisible().catch(()=>false)){
  const more=page.getByRole('menuitem',{name:/更多模型|More models/});if(await more.count())await more.first().hover();
 }
 await row.first().click({timeout:15000});checks.modelSelected=true;
 await page.screenshot({path:path.join(out,'02-model-selected.png')});
 await composer.fill('这是本地传输验收，请回复一句确认。');await composer.press('Enter');
 await page.getByText('MODEL_QA_REPLY_42 自定义接口传输通过（本地测试响应）。',{exact:true}).waitFor({timeout:90000});
 await page.screenshot({path:path.join(out,'03-chat-response.png')});checks.replyRendered=true;
 assert(requests.some(r=>r.path==='/v1/chat/completions'&&r.model===modelId&&r.authorized&&r.stream===true));checks.chatCompletionsRouted=true;
 await page.reload({waitUntil:'load'});await page.getByText('MODEL_QA_REPLY_42 自定义接口传输通过（本地测试响应）。',{exact:true}).waitFor({timeout:60000});checks.replyPersisted=true;
 await page.locator('[contenteditable="true"]').first().fill('只读工具验收：请调用 list-episodes 读取当前作品列表，不修改项目。');await page.locator('[contenteditable="true"]').first().press('Enter');
 await page.getByText('MODEL_QA_TOOL_43 已收到 list-episodes 的真实工具结果（本地测试响应）。',{exact:true}).waitFor({timeout:90000});
 assert(requests.some(r=>r.toolResultReceived&&r.hasEpisodeData),'No real episode tool result returned to fixture');checks.toolRoundTrip=true;
 await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:path.join(out,'04-tool-response.png')});
 checks.requests=requests;checks.pageErrors=errors;checks.completed=true;
 console.log('MODEL_CHAT_QA_PASSED',JSON.stringify({scope:checks.scope,requests:requests.length,replyPersisted:true}));
}catch(e){checks.completed=false;checks.failure=String(e);checks.requests=requests;checks.pageErrors=errors;if(page){await page.screenshot({path:path.join(out,'failure.png')}).catch(()=>{});await writeFile(path.join(out,'page-state.txt'),await page.locator('body').innerText().catch(()=>''));}console.error(e);process.exitCode=1;}
finally{await writeFile(path.join(out,'result.json'),JSON.stringify(checks,null,2));await browser?.close();server.kill('SIGTERM');mock.closeAllConnections();await new Promise(r=>mock.close(r));await log.close();}
