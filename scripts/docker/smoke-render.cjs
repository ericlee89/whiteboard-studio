// Explicit local acceptance test. Uses real Edge speech; no text-model or paid TTS call.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const origin = "http://127.0.0.1:4317";
async function action(name, input, readOnly = false) {
  const url = new URL("/_agent-native/actions/" + name, origin);
  if (readOnly) for (const [key, value] of Object.entries(input)) url.searchParams.set(key, value);
  const response = await fetch(url, readOnly ? {} : { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(input) });
  if (response.status === 401 || response.status === 403) throw new Error("This CLI test requires the localhost single-user test mode. For account mode, run the same workflow from the signed-in UI.");
  if (!response.ok) throw new Error(`${name} failed (${response.status}). Check application logs.`);
  return response.json();
}
async function wait(id) {
  let stage = "";
  for (let i = 0; i < 600; i++) {
    const result = await action("render-status", { id }, true);
    if (result.stage !== stage) { stage = result.stage; console.log(stage); }
    if (result.state === "done") return result;
    if (result.state === "failed") throw new Error(result.stage + "; inspect the task log in the UI.");
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error("Render did not finish within 10 minutes.");
}
async function main() {
  const id = "docker-smoke-" + crypto.randomUUID();
  const episode = { id, title: "Docker 出片验收", sample: true, engine: "edge", voice: "zh-CN-YunxiNeural", speed: 1.2, highlight: true, brand: "白板工作室", sources: "Docker 本地验收内容，仅用于验证应用运行。", publish: "验收测试，不发布。", scenes: [{ title: "统一环境，一键出片", narration: "统一运行环境，保存项目。|生成白板视频，检查字幕和声音。", points: ["统一运行环境", "检查视频和字幕"] }] };
  await action("save-episode", { episode });
  await action("start-render", { id, mode: "preview" });await wait(id);
  await action("start-render", { id, mode: "build" });const result = await wait(id);
  const output = path.resolve("data/docker-smoke", id);fs.mkdirSync(output, { recursive: true });
  const downloads = [];
  for (const file of result.files.filter(file => /final\.mp4$|字幕\.srt$|封面-/.test(file.name))) {
    const response = await fetch(new URL(file.url, origin));if (!response.ok) throw new Error("Download failed: " + file.name);
    const bytes = Buffer.from(await response.arrayBuffer());if (!bytes.length) throw new Error("Empty output: " + file.name);
    fs.writeFileSync(path.join(output, path.basename(file.name)), bytes);downloads.push(file.name);
  }
  if (downloads.length !== 5) throw new Error("Expected MP4, SRT and three covers.");
  const video = path.join(output, "final.mp4");
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", video]));
  const stream = probe.streams.find(stream => stream.codec_type === "video"), audio = probe.streams.find(stream => stream.codec_type === "audio");
  if (stream?.width !== 1920 || stream?.height !== 1080 || !audio) throw new Error("Video dimensions or audio stream are incorrect.");
  execFileSync("ffmpeg", ["-v", "error", "-i", video, "-f", "null", "-"], { stdio: "inherit" });
  const report = { passed: true, projectId: id, duration: Number(probe.format.duration), width: stream.width, height: stream.height, audio: audio.codec_name, downloads, output };
  fs.writeFileSync(path.join(output, "acceptance.json"), JSON.stringify(report, null, 2));console.log(JSON.stringify(report, null, 2));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
