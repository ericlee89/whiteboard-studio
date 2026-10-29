import {spawn} from "node:child_process";
import {mkdir,writeFile,open} from "node:fs/promises";
import {createRequire} from "node:module";
import path from "node:path";
const require=createRequire(import.meta.url);
const {chromium}=require("../engine/node_modules/playwright");
await mkdir(".tmp/ui-review/out",{recursive:true});
const out=path.resolve(".tmp/ui-review/out"),log=await open(".tmp/verify-server.log","a");
const browserPath=path.resolve(".tmp/chrome/chrome-headless-shell-linux64/chrome-headless-shell");
const server=spawn(process.execPath,["node_modules/@agent-native/core/bin/agent-native.js","dev","--port","4320","--host","127.0.0.1"],{stdio:["ignore",log.fd,log.fd],env:{...process.env,AUTH_DISABLED:"1",DATABASE_URL:"pglite:"+path.resolve(".tmp/qa-db-"+Date.now()),WB_CHROMIUM:browserPath}});
const url="http://127.0.0.1:4320";
let browser;
try{
 let ready=false;for(let i=0;i<90;i++){try{const r=await fetch(url);if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}if(!ready)throw new Error("Server not ready");
 browser=await chromium.launch({executablePath:browserPath,args:["--no-sandbox","--disable-dev-shm-usage"]});
 const metrics=[];
 for(const pass of (process.argv.includes("--workflow-only")?[]:["p1","p2"])){
  for(const [width,height,tag]of [[1440,900,"desktop"],[390,844,"mobile"]]){
   for(const colorScheme of ["light","dark"]){
    const context=await browser.newContext({viewport:{width,height},colorScheme});
    const page=await context.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
    await page.goto(url,{waitUntil:"load",timeout:120000});
    await page.locator("#scene-title").waitFor({timeout:90000});
    if(await page.getByRole("button",{name:"Reject all",exact:true}).isVisible().catch(()=>false))await page.getByRole("button",{name:"Reject all",exact:true}).click();
    await page.evaluate(()=>document.fonts.ready);
    await page.screenshot({path:path.join(out,pass+"-"+tag+"-"+colorScheme+".png")});
    const m=await page.evaluate(()=>({path:location.pathname,overflowX:document.documentElement.scrollWidth>innerWidth+1,visuals:document.querySelectorAll("svg[viewBox]").length}));
    metrics.push({pass,tag,colorScheme,...m,errors});
    if(tag==="desktop"&&colorScheme==="light"){
     await page.getByRole("button",{name:"润色这一幕",exact:true}).click();await page.waitForTimeout(500);
     await page.screenshot({path:path.join(out,pass+"-agent.png")});
    }
    await context.close();
   }
  }
 }
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.goto(url);await page.locator("#scene-title").waitFor();
 await page.locator("#scene-title").fill("把复杂的事，讲清楚");
 await page.getByRole("button",{name:"保存修改",exact:true}).click();await page.getByText("项目已保存",{exact:true}).waitFor();
 await page.reload();await page.locator("#scene-title").waitFor();if(await page.locator("#scene-title").inputValue()!=="把复杂的事，讲清楚")throw new Error("Save readback failed");
 await page.locator("#scene-title").fill("把复杂的事，画简单");await page.getByRole("button",{name:"保存修改",exact:true}).click();await page.getByText("项目已保存",{exact:true}).waitFor();
 const started=page.waitForResponse(r=>r.url().includes("/actions/start-render")&&r.request().method()==="POST",{timeout:30000});
 await page.getByRole("button",{name:"渲染预览",exact:true}).click();
 const startResponse=await started;if(!startResponse.ok())throw new Error("Render start failed: "+await startResponse.text());
 await page.waitForTimeout(1000);
 await page.getByRole("button",{name:"渲染预览",exact:true}).waitFor({state:"visible"});
 let renderState;for(let i=0;i<90;i++){
  const r=await page.request.get(url+"/_agent-native/actions/render-status?id=sample-whiteboard");renderState=await r.json();
  if(["done","failed"].includes(renderState?.state))break;await page.waitForTimeout(1000);
 }
 await page.locator("#scene-title").waitFor();await page.waitForTimeout(1000);
 await page.screenshot({path:path.join(out,"preview-result.png")});
 if(renderState?.state==="done"){const cover=renderState.files.find(f=>f.name==="封面-4x3.png");const r=await page.request.get(url+cover.url);if(!r.ok()||!r.headers()["content-type"]?.includes("image/png"))throw new Error("Download route failed");}
 await writeFile(path.join(out,process.argv.includes("--workflow-only")?"workflow.json":"metrics.json"),JSON.stringify({metrics,saveReadback:true,renderState},null,2));
 console.log(JSON.stringify({metrics,saveReadback:true,renderState},null,2));
 if(renderState?.state!=="done")throw new Error("Preview export did not complete");
}finally{await browser?.close();server.kill("SIGTERM");await log.close();}
