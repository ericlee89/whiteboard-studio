import {spawn} from "node:child_process";
import {open,mkdir,writeFile} from "node:fs/promises";
import path from "node:path";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url),{chromium}=require("../engine/node_modules/playwright");
await mkdir(".tmp/custom-model",{recursive:true});
const log=await open(".tmp/custom-model/server.log","a"),url="http://127.0.0.1:4328";
const server=spawn(process.execPath,["node_modules/@agent-native/core/bin/agent-native.js","dev","--host","127.0.0.1","--port","4328"],{stdio:["ignore",log.fd,log.fd],env:{...process.env,AUTH_DISABLED:"1",DATABASE_URL:"pglite:"+path.resolve(".tmp/custom-model/db-"+Date.now())}});
let browser;
try{
 for(let i=0;i<90;i++){try{if((await fetch(url,{signal:AbortSignal.timeout(3000)})).ok)break;}catch{}await new Promise(r=>setTimeout(r,1000));}
 if(process.argv.includes("--api-only")){
  const body={scope:"user",apiKey:"qa-placeholder-not-a-real-key",baseUrl:"https://example.com/v1",modelId:"custom-model-qa",label:"自定义模型验收"};
  const response=await fetch(url+"/custom-model-provider",{method:"POST",headers:{"Content-Type":"application/json",Origin:url},body:JSON.stringify(body)});
  const payload=await response.json();if(!response.ok)throw new Error(JSON.stringify(payload));
  const meta=await (await fetch(url+"/_agent-native/actions/get-custom-model-settings?scope=user")).json();
  const models=await (await fetch(url+"/_agent-native/actions/get-provider-models?provider=openai&scope=user")).json();
  if(meta.modelId!==body.modelId||meta.label!==body.label||!JSON.stringify(models).includes(body.modelId)||JSON.stringify(payload).includes(body.apiKey))throw new Error("Readback or secret redaction failed");
  const denied=await fetch(url+"/custom-model-provider",{method:"POST",headers:{"Content-Type":"application/json",Origin:"https://other.example"},body:"{}"});
  if(denied.status!==403)throw new Error("Origin guard failed");
  await writeFile(".tmp/custom-model/api-result.json",JSON.stringify({payload,metadata:meta,selectionPersisted:true,crossOriginStatus:403},null,2));
  console.log("CUSTOM_MODEL_API_QA_PASSED");process.exitCode=0;
 }else{
 browser=await chromium.launch({executablePath:path.resolve(".tmp/chrome145/chrome-headless-shell-linux64/chrome-headless-shell"),args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];page.on("pageerror",e=>errors.push(e.message));
 await page.goto(url+"/settings/model",{waitUntil:"load",timeout:120000});
 const add=page.getByRole("button",{name:/^(Add provider|添加提供商)$/}).first();await add.waitFor({timeout:90000});await add.click();
 await page.getByRole("combobox").last().click();
 await page.getByRole("option",{name:"自定义（OpenAI 兼容）",exact:true}).click();
 const dialog=page.getByRole("dialog");await dialog.getByLabel(/API key|API 密钥/i).fill("qa-placeholder-not-a-real-key");
 await dialog.locator('input[type="url"]').fill("https://example.com/v1");
 await dialog.getByLabel("模型 ID",{exact:true}).fill("custom-model-qa");
 await dialog.getByLabel("显示名称",{exact:true}).fill("自定义模型验收");
 await page.screenshot({path:".tmp/custom-model/dialog.png"});
 const responsePromise=page.waitForResponse(r=>r.url().endsWith("/custom-model-provider")&&r.request().method()==="POST");
 await dialog.getByRole("button",{name:/^(Add provider|添加提供商)$/}).click();
 const response=await responsePromise;const payload=await response.json();if(!response.ok())throw new Error(JSON.stringify(payload));
 if(payload.modelId!=="custom-model-qa"||payload.validation!=="not-tested")throw new Error("Unexpected save result");
 if(JSON.stringify(payload).includes("qa-placeholder"))throw new Error("Secret leaked");
 await dialog.waitFor({state:"hidden"});
 const read=await page.request.get(url+"/_agent-native/actions/get-custom-model-settings?scope="+payload.scope);const meta=await read.json();
 if(meta.modelId!=="custom-model-qa"||meta.label!=="自定义模型验收")throw new Error("Metadata readback failed "+JSON.stringify(meta));
 const modelsResponse=await page.request.get(url+"/_agent-native/actions/get-provider-models?provider=openai&scope="+payload.scope);
 const models=await modelsResponse.json();if(!JSON.stringify(models).includes("custom-model-qa"))throw new Error("Model picker selection not persisted");
 const denied=await page.request.post(url+"/custom-model-provider",{headers:{Origin:"https://other.example"},data:{}});if(denied.status()!==403)throw new Error("Origin guard failed");
 await page.reload();await add.waitFor();await page.screenshot({path:".tmp/custom-model/saved.png"});
 await writeFile(".tmp/custom-model/result.json",JSON.stringify({saved:payload,metadata:meta,selectionPersisted:true,crossOriginStatus:denied.status(),errors},null,2));
 console.log("CUSTOM_MODEL_QA_PASSED",JSON.stringify({scope:payload.scope,modelId:meta.modelId,selectionPersisted:true,crossOriginStatus:denied.status(),errors}));
 }
}finally{await browser?.close();server.kill("SIGTERM");await log.close();}
