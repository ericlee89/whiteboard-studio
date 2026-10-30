// Isolated deterministic runner. Never executes user-provided JavaScript.
const fs = require("node:fs"),
  path = require("node:path");
const { linkEngineModules, cancellationError, runStep, loadRenderEnvironment } = require("./render-process.cjs");
const root = process.cwd(),
  [jobDir, mode] = process.argv.slice(2);
const statusFile = path.join(jobDir, "status.json");
const cancelFile = path.join(jobDir, "cancel.requested");
const status = (v) => fs.writeFileSync(statusFile, JSON.stringify(v));
async function main() {
try {
  loadRenderEnvironment(root);
  if (fs.existsSync(cancelFile)) throw cancellationError();
  const ep = JSON.parse(
    fs.readFileSync(path.join(jobDir, "episode.json"), "utf8"),
  );
  const engine = path.join(jobDir, "engine");
  fs.mkdirSync(engine, { recursive: true });
  for (const d of ["lib", "assets", "bin"])
    fs.cpSync(path.join(root, "engine", d), path.join(engine, d), {
      recursive: true,
    });
  fs.writeFileSync(path.join(engine, "package.json"), '{"type":"commonjs"}');
  linkEngineModules(root, engine);
  const cfg = JSON.parse(
    fs.readFileSync(path.join(root, "engine/config.json"), "utf8"),
  );
  cfg.dirs = { projects: "./episodes", build: "./build" };
  cfg.tts.engine = ep.engine;
  cfg.tts.speed = ep.speed;
  cfg.tts.edge.python = "";
  cfg.tts.edge.voice = ep.engine === "edge" ? ep.voice : "zh-CN-YunxiNeural";
  cfg.tts.mi.voice = ep.engine === "mi" ? ep.voice : "冰糖";
  cfg.tts.mi.baseUrl =
    process.env.MI_TTS_BASE_URL || "https://api.xiaomimimo.com/v1"; // guard:allow-env-credential — Local-files desktop CLI only; runs in an isolated child process with operator-owned environment, never a hosted shared request.
  if (ep.engine === "volc") cfg.tts.voice = ep.voice;
  cfg.brand.name = ep.brand;
  cfg.brand.slogan = "让每个好想法，都被讲清楚";
  cfg.captions.highlight.enabled = ep.highlight;
  cfg.render.workers = 2;
  // 画面风格：kai 是「楷体 + 暖米黄」，用 culture 的纸色叠 override 字体实现；
  // 其余四档走纯预设，必须清空 override，否则 override 优先级更高会把字体锁死。
  const style = ep.style || "kai";
  cfg.style = cfg.style || {};
  cfg.style.preset = style === "kai" ? "culture" : style;
  cfg.style.override = style === "kai" ? { fontFile: "STKAITI.TTF" } : {};
  fs.writeFileSync(path.join(engine, "config.json"), JSON.stringify(cfg));
  const project = path.join(engine, "episodes", ep.id);
  fs.mkdirSync(project, { recursive: true });
  // 场景配图：任务快照里的 assets/ 落到本期目录，scene-dsl 从 project/assets 取图
  const jobAssets = path.join(jobDir, "assets");
  if (fs.existsSync(jobAssets))
    fs.cpSync(jobAssets, path.join(project, "assets"), { recursive: true });
  const dsl = path.join(engine, "lib/scene-dsl.js");
  const titleChars = [...ep.title.replace(/[，、：:。！!?？]/g, "")].slice(
    0,
    16,
  );
  const splitAt = Math.ceil(titleChars.length / 2);
  const coverTitle =
    titleChars.length > 7
      ? titleChars.slice(0, splitAt).join("") +
        "\n" +
        titleChars.slice(splitAt).join("")
      : titleChars.join("");
  const source = `const {Scene,C,CX,build}=require(${JSON.stringify(dsl)}).use(__dirname);
const items=${JSON.stringify(ep.scenes)};
const scenes=items.map((item,i)=>{
 const s=new Scene(String(i+1).padStart(2,'0')+'-scene',item.narration);
 const img=item.image||null;
 const vid=item.video||null;
 const media=img||vid;
 const full=!!media&&media.fit==='full';
 const side=!!media&&!full;
 const boxX=side?140:260, boxW=side?820:1400;
 const layout=media?'list':(item.layout||'list');
 const pts=item.points||[];
 const beats=item.narration.split('|');
 const span=(n,j)=>{const per=Math.max(1,Math.ceil(n/beats.length));const from=Math.min(n,j*per);return [from,Math.min(n,from+per)];};
 const splitHalf=Math.ceil(pts.length/2);
 const splitH=Math.max(120+Math.max(2,splitHalf)*112,120+Math.max(2,pts.length-splitHalf)*112);
 const splitY=240+Math.round((640-splitH)/2);
 beats.forEach((_,j)=>{s.nextBeat();
 if(j===0){
  const tSize=layout==='hero'?128:80, tY=layout==='hero'?320:60;
  s.text(CX,tY,item.title,{size:tSize,align:'center',color:C.brand});
  if(img){
   const name=img.file.replace(/\\.png$/,'');
   const d=s.imageSize(name);
   const maxH=full?740:660;
   let w=full?1500:760;
   let h=Math.round(w*d.h/d.w);
   if(h>maxH){h=maxH;w=Math.round(h*d.w/d.h);}
   if(full)s.image(CX,210+(740-h)/2,name,{w,h,align:'center'});
   else s.image(1010+(850-w)/2,260+(660-h)/2,name,{w,h});
  }
  if(layout==='split'){
   s.rect(180,splitY,640,splitH,{round:true,fill:C.fBlue,fillStyle:'hachure',roughness:1.2});
   s.rect(1100,splitY,640,splitH,{round:true,fill:C.fGreen,fillStyle:'hachure',roughness:1.2});
   s.line([[CX,splitY-25],[CX,splitY+splitH+40]],{strokeStyle:'dashed',stroke:C.gray});
  }
 }
 if(layout==='list'){
  if(!full){
   const subset=pts.filter((p,k)=>k%beats.length===j);
   subset.forEach((p,n)=>{const k=pts.indexOf(p), y=250+k*105;s.rect(boxX,y,boxW,82,{round:true,fill:k%2?C.fBlue:C.fGreen});s.text(boxX+70,y+14,p,{size:side?34:40});});
  }
 } else if(layout==='split'){
  const half=Math.ceil(pts.length/2);
  const seg=span(pts.length,j);
  for(let n=seg[0];n<seg[1];n++){
   const left=n<half, row=left?n:n-half;
   s.text(left?230:1150,splitY+70+row*112,pts[n],{size:34});
  }
 } else if(layout==='columns'){
  const cols=pts.slice(0,3), fills=[C.fYellow,C.fPurple,C.fBlue], cx=[300,960,1620];
  const seg=span(cols.length,j);
  for(let n=seg[0];n<seg[1];n++){
   s.rect(cx[n]-210,340,420,440,{round:true,fill:fills[n],fillStyle:'hachure',roughness:1.2});
   s.text(cx[n],560,cols[n],{size:cols[n].length>9?34:46,align:'center'});
  }
 } else if(layout==='summary'){
  const seg=span(pts.length,j);
  for(let n=seg[0];n<seg[1];n++){
   s.text(CX,340+n*140,pts[n],{size:72,align:'center',color:n===pts.length-1?C.brand:C.ink});
  }
  if(j===beats.length-1)s.squiggle(560,1360,Math.min(340+(pts.length-1)*140+95,900),{stroke:C.orange});
 } else if(layout==='hero'){
  const hp=pts.slice(0,3), seg=span(hp.length,j);
  for(let n=seg[0];n<seg[1];n++){
   s.text(hp.length===1?CX:[440,960,1480][n],680,hp[n],{size:44,align:'center',color:C.gray});
  }
 }
 });return s;
});
const cover=(s,ratio)=>s.coverLayout({ratio,title:${JSON.stringify(coverTitle)},sub:epTitle,tag:"白板讲清楚"});
const epTitle=${JSON.stringify(ep.title)};build(__dirname,scenes,{cover});`;
  fs.writeFileSync(path.join(project, "scenes.js"), source);
  fs.writeFileSync(path.join(project, "README.md"), ep.sources);
  fs.writeFileSync(path.join(project, "发布.md"), ep.publish);
  const steps =
    mode === "preview"
      ? ["stills", "cover"]
      : ["scenes", "tts", "render", "mix", "cover"];
  for (let i = 0; i < steps.length; i++) {
    if (fs.existsSync(cancelFile)) throw cancellationError();
    status({
      state: "running",
      stage: steps[i],
      progress: Math.round((i / steps.length) * 100),
      mode,
    });
    const run = async (exe, args) => {
      try { await runStep(exe, args, {
        cwd: engine,
        cancelFile,
        onCancel: () => status({ state: "running", stage: "正在取消任务…", progress: Math.round((i / steps.length) * 100), mode }),
      }); } catch (error) {
        if (error.code === "RENDER_CANCELLED") throw error;
        throw new Error("工序 " + steps[i] + " 失败：" + error.message + "。请查看任务日志", { cause: error });
      }
    };
    const node = (...args) => run(process.execPath, args);
    // scene-dsl 不认识视频：scenes.js 跑完产出 script.json 后，在这里把 video 元数据
    // 按场景顺序注入。render.js 编码该段时据此叠画中画，引擎核心不用动。
    const runScenes = async () => {
      await node(path.join(project, "scenes.js"));
      const scriptFile = path.join(project, "scenes", "script.json");
      if (!fs.existsSync(scriptFile)) return;
      const meta = JSON.parse(fs.readFileSync(scriptFile, "utf8"));
      let touched = false;
      meta.forEach((sc, i) => {
        const v = ep.scenes[i] && ep.scenes[i].video;
        if (v) {
          sc.video = v;
          touched = true;
        }
      });
      if (touched) fs.writeFileSync(scriptFile, JSON.stringify(meta, null, 1));
    };
    const stage = steps[i];
    if (stage === "scenes") await runScenes();
    else if (stage === "tts") {
      if (ep.engine === "edge")
        await run(process.platform === "win32" ? "python" : "python3", [
          path.join(engine, "lib/tts-edge.py"),
          project,
        ]);
      else await node(path.join(engine, "lib/tts-volc.mjs"), project);
    } else if (stage === "mix")
      await node(path.join(engine, "lib/mix-bgm.mjs"), project);
    else {
      if (stage !== "render") await runScenes();
      await node(
        path.join(engine, "lib/render.js"),
        project,
        ...(stage === "stills"
          ? ["--stills"]
          : stage === "cover"
            ? ["--cover"]
            : []),
      );
    }
  }
  if (fs.existsSync(cancelFile)) throw cancellationError();
  status({
    state: "done",
    stage: mode === "preview" ? "预览与封面已生成" : "成片已生成",
    progress: 100,
    mode,
  });
} catch (e) {
  status({ state: "failed", stage: String(e.message), progress: 0, mode });
  process.exitCode = 1;
}
}
void main();
