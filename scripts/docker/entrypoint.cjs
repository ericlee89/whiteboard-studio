const fs = require("node:fs");
const path = require("node:path");
const { createRequire } = require("node:module");
const { spawn, spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "../..");

function verifyDeployment(env = process.env, appRoot = root) {
  const deployment = require('../deploy/deployment-config.mjs').deployment(env);
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 22 || (major === 22 && minor < 22)) throw new Error("Node.js >= 22.22 is required.");
  if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL || "")) throw new Error("Production requires a PostgreSQL DATABASE_URL; use the included Compose database.");
  for (const key of ["BETTER_AUTH_SECRET", "SECRETS_ENCRYPTION_KEY", "A2A_SECRET"]) {
    if (!env[key] || env[key].length < 32) throw new Error(`${key} is missing or too short. Run docker-start.cmd / docker-start.sh first.`);
  }
  const localSingleUser = env.LOCAL_SINGLE_USER === "1";
  if (["1", "true"].includes(env.AUTH_DISABLED) && !localSingleUser)
    throw new Error("AUTH_DISABLED requires the explicitly selected LOCAL_SINGLE_USER=1 localhost test mode.");
  if (env.AGENT_NATIVE_ALLOW_LOCAL_FILES_IN_PRODUCTION !== "true")
    throw new Error("This single-instance workbench requires the Compose local-file bridge setting.");
  for (const name of ["data", ".agent-native"]) {
    const dir = path.join(appRoot, name);fs.mkdirSync(dir, { recursive: true });fs.accessSync(dir, fs.constants.W_OK);
  }
  const engineRequire = createRequire(path.join(appRoot, "engine/package.json"));
  for (const name of ["playwright", "roughjs", "lz-string"]) engineRequire.resolve(name);
  const { chromium } = engineRequire("playwright");
  const config = JSON.parse(fs.readFileSync(path.join(appRoot, "engine/config.json"), "utf8"));
  const configured = config.render.chromium ? path.resolve(appRoot, "engine", config.render.chromium) : null;
  const browser = require(path.join(appRoot, "engine/lib/chromium.cjs")).resolveChromium(configured) || chromium.executablePath();
  if (!fs.existsSync(browser)) throw new Error("Chromium is missing. Rebuild the image; do not mount host node_modules into the container.");
  for (const exe of ["ffmpeg", "ffprobe"]) {
    const r = spawnSync(exe, ["-version"], { stdio: "ignore" });if (r.status !== 0) throw new Error(`${exe} is missing from the image.`);
  }
  if (spawnSync("python3", ["-c", "import edge_tts"], { stdio: "ignore" }).status !== 0) throw new Error("Python edge-tts is missing from the image.");
  if (!fs.existsSync(path.join(appRoot, ".output/server/index.mjs"))) throw new Error("Production server is missing. Rebuild the image.");
  return { ready: true, browser, database: "postgresql", mode: deployment.mode };
}

function recoverInterruptedJobs(appRoot = root) {
  const jobs = path.join(appRoot, "data/jobs");
  if (!fs.existsSync(jobs)) return 0;
  let recovered = 0;
  for (const owner of fs.readdirSync(jobs, { withFileTypes: true })) {
    if (!owner.isDirectory()) continue;
    const ownerDir = path.join(jobs, owner.name);
    for (const project of fs.readdirSync(ownerDir, { withFileTypes: true })) {
      if (!project.isDirectory()) continue;
      const dir = path.join(ownerDir, project.name);
      try {
        const latest = JSON.parse(fs.readFileSync(path.join(dir, "latest.json"), "utf8"));
        if (!/^[a-z0-9-]{1,80}$/.test(latest.job)) continue;
        const file = path.join(dir, latest.job, "status.json"), status = JSON.parse(fs.readFileSync(file, "utf8"));
        if (status.state !== "running") continue;
        fs.writeFileSync(file, JSON.stringify({ ...status, state: "failed", stage: "服务已重新启动，请重新出片", progress: 0 }));
        const lock = path.join(dir, "lock");
        if (fs.existsSync(lock) && fs.readFileSync(lock, "utf8") === latest.job) fs.unlinkSync(lock);
        recovered++;
      } catch (error) { if (error.code !== "ENOENT" && !(error instanceof SyntaxError)) throw error; }
    }
  }
  return recovered;
}

async function main() {
  process.chdir(root);
  const storage = require('./persistent-storage.cjs').preparePersistentStorage(process.env, root);
  // Railway mounts its volume as root. Bootstrap its two directories and then
  // run migrations, the server and all render workers as the image's node user.
  if (storage.enabled && process.getuid?.() === 0) {
    process.setgid(1000);
    process.setuid(1000);
  }
  verifyDeployment();
  if (process.argv.includes("--check")) { console.log("Container runtime dependencies and deployment configuration are ready."); return; }
  // One app instance owns these volumes. A former container's PIDs cannot be
  // trusted after restart, and no old worker can still run in the new container.
  const recovered = recoverInterruptedJobs();
  if (recovered) console.log(`[docker] Recovered ${recovered} interrupted render job(s).`);
  let child, stopping = false;
  const forward = signal => { stopping = true; if (child && child.exitCode === null) child.kill(signal); };
  process.on("SIGTERM", () => forward("SIGTERM"));process.on("SIGINT", () => forward("SIGINT"));
  const run = args => new Promise((resolve, reject) => {
    child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
    child.once("error", reject);child.once("close", code => code === 0 || stopping ? resolve() : reject(new Error(`Container subprocess exited (${code}).`)));
  });
  console.log("[docker] Applying database migrations...");
  await run(["--import", require.resolve("tsx"), path.join(root, "scripts/migrate-production.ts")]);
  if (stopping) return;
  console.log("[docker] Starting Whiteboard Studio on 0.0.0.0:4317");
  await run([path.join(root, ".output/server/index.mjs")]);
}
if (require.main === module) main().catch(error => { console.error("[docker] " + error.message); process.exitCode = 1; });
module.exports = { verifyDeployment, recoverInterruptedJobs };
