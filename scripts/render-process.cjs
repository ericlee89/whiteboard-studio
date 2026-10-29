const fs = require("node:fs");
const path = require("node:path");
const { spawn, execFile } = require("node:child_process");

function loadRenderEnvironment(root) {
  // The worker runs inside a job snapshot, whose engine intentionally contains
  // no .env file. Load the operator's project-level configuration once in this
  // local CLI and inherit it into child processes; never copy keys into jobs.
  try {
    process.loadEnvFile(path.join(root, ".env")); // guard:allow-env-mutation — Operator-owned local CLI configuration, isolated from hosted requests.
  } catch (error) {
    if (error.code !== "ENOENT")
      throw new Error(`无法读取项目根目录 .env（${error.code || "读取失败"}），请检查文件权限和编码`);
  }
}

function linkEngineModules(root, engine, platform = process.platform, io = fs) {
  const target = path.resolve(root, "engine/node_modules");
  const link = path.join(engine, "node_modules");
  if (!io.existsSync(target))
    throw new Error("缺少渲染依赖：请先运行 npm --prefix engine ci --ignore-scripts");
  try {
    // NTFS junctions do not require the symbolic-link privilege of type "dir".
    io.symlinkSync(target, link, platform === "win32" ? "junction" : "dir");
  } catch (error) {
    throw new Error(
      `无法连接渲染依赖目录（${error.code || "UNKNOWN"}）。请确认项目位于可写的本地磁盘，且安全软件未阻止目录联接。原始错误：${error.message}`,
      { cause: error },
    );
  }
}

function cancellationError() {
  return Object.assign(new Error("任务已取消，可重新出片"), { code: "RENDER_CANCELLED" });
}

// Only terminates a child spawned and still tracked by this runner. No PID from
// an HTTP request or a stale database record is accepted here.
function terminateChildTree(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32") {
    execFile("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true }, (error) => {
      if (error && child.exitCode === null && child.signalCode === null) child.kill();
    });
  } else {
    // A cancelled stage is disposable. Stop the entire owned group together so
    // a Chromium/ffmpeg grandchild cannot survive an early parent exit.
    try { process.kill(-child.pid, "SIGKILL"); }
    catch (error) { if (error.code !== "ESRCH") child.kill("SIGKILL"); }
  }
}

function runStep(exe, args, { cwd, cancelFile, onCancel = () => {}, timeoutMs = 1800000 }) {
  if (fs.existsSync(cancelFile)) return Promise.reject(cancellationError());
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      cwd,
      stdio: "inherit",
      detached: process.platform !== "win32",
      windowsHide: true,
      env: process.env, // guard:allow-env-credential — Isolated local rendering CLI with operator-owned environment, not a hosted request.
    });
    let reason;
    const stop = (error) => {
      if (reason) return;
      reason = error;
      if (error.code === "RENDER_CANCELLED") onCancel();
      terminateChildTree(child);
    };
    const poll = setInterval(() => {
      if (fs.existsSync(cancelFile)) stop(cancellationError());
    }, 200);
    const timeout = setTimeout(() => stop(new Error(`工序执行超时（${Math.round(timeoutMs / 1000)} 秒）`)), timeoutMs);
    const cleanup = () => { clearInterval(poll); clearTimeout(timeout); };
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("close", (code, signal) => {
      cleanup();
      if (reason) reject(reason);
      else if (code !== 0) reject(new Error(`${exe} 退出失败（${code ?? signal}）`));
      else resolve();
    });
  });
}

module.exports = { linkEngineModules, cancellationError, runStep, loadRenderEnvironment };
