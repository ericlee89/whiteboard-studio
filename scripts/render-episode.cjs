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
  fs.writeFileSync(path.join(engine, "config.json"), JSON.stringify(cfg));
  const project = path.join(engine, "episodes", ep.id);
  fs.mkdirSync(project, { recursive: true });
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
 const beats=item.narration.split('|');
 beats.forEach((_,j)=>{s.nextBeat();if(j===0){s.text(CX,60,item.title,{size:80,align:'center',color:C.brand});}
 const subset=item.points.filter((p,k)=>k%beats.length===j);
 subset.forEach((p,n)=>{const k=item.points.indexOf(p), y=250+k*105;s.rect(260,y,1400,82,{round:true,fill:k%2?C.fBlue:C.fGreen});s.text(330,y+13,p,{size:40});});
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
    const stage = steps[i];
    if (stage === "scenes") await node(path.join(project, "scenes.js"));
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
      if (stage !== "render") await node(path.join(project, "scenes.js"));
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
