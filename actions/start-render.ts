import { defineAction, fail } from "@agent-native/core/action";
import { readAppSecret } from "@agent-native/core";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { ownerKey, loadEpisode } from "../server/studio-store";

/** 与 server/plugins/tts-secrets.ts 注册的条目保持一致。 */
const TTS_SECRET_KEYS = ["VOLC_TTS_API_KEY", "MI_TTS_API_KEY"] as const;

export default defineAction({
  description:
    "Run original whiteboard engine: preview creates stills/covers; build creates narrated MP4. One active job per project.",
  schema: z.object({
    id: z
      .string()
      .regex(/^[a-z0-9-]{1,80}$/)
      .describe("Project id"),
    mode: z
      .enum(["preview", "build"])
      .describe("preview for images, build for MP4"),
  }),
  run: async ({ id, mode }, ctx) => {
    const owner = ownerKey(ctx?.userEmail),
      p = await loadEpisode(owner, id);
    if (!p)
      return fail("项目不存在", { statusCode: 404, errorCode: "NOT_FOUND" });
    const base = path.resolve("data/jobs", owner, id),
      lock = path.join(base, "lock");
    fs.mkdirSync(base, { recursive: true });
    // Synchronous acquisition and publication cannot interleave within this local server.
    if (fs.existsSync(lock)) {
      let terminal = false;
      try {
        const l = JSON.parse(
          fs.readFileSync(path.join(base, "latest.json"), "utf8"),
        );
        const s = JSON.parse(
          fs.readFileSync(path.join(base, l.job, "status.json"), "utf8"),
        );
        terminal = ["done", "failed"].includes(s.state);
        if (!terminal) {
          try {
            process.kill(l.pid, 0);
          } catch {
            terminal = true;
          }
        }
      } catch {}
      if (terminal) fs.unlinkSync(lock);
    }
    let fd: number;
    try {
      fd = fs.openSync(lock, "wx");
    } catch {
      return fail("项目有任务正在执行，请稍后再试", {
        statusCode: 409,
        errorCode: "BUSY",
      });
    }
    const job = crypto.randomUUID(),
      dir = path.join(base, job);
    const release = () => {
      try {
        if (fs.readFileSync(lock, "utf8") === job) fs.unlinkSync(lock);
      } catch {}
    };
    try {
      fs.writeFileSync(fd, job);
      fs.closeSync(fd);
      fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(dir, "episode.json"),
        JSON.stringify(p.episode),
      );
      fs.writeFileSync(
        path.join(dir, "status.json"),
        JSON.stringify({
          state: "running",
          stage: "准备引擎",
          progress: 0,
          mode,
        }),
      );
      const log = fs.openSync(path.join(dir, "render.log"), "a");
      // 配音凭证：密钥库优先，项目根 .env 兜底。
      // Node 的 loadEnvFile 不覆盖已存在的变量，所以这里注入的值会压过 .env。
      const renderEnv: NodeJS.ProcessEnv = { ...process.env };
      if (ctx?.userEmail) {
        for (const key of TTS_SECRET_KEYS) {
          try {
            const stored = await readAppSecret({
              key,
              scope: "user",
              scopeId: ctx.userEmail,
            });
            if (stored?.value) renderEnv[key] = stored.value;
          } catch {
            // 读不到就让 .env 的默认值生效，不阻断出片
          }
        }
      }
      const child = spawn(
        process.execPath,
        [path.resolve("scripts/render-episode.cjs"), dir, mode],
        {
          cwd: process.cwd(),
          stdio: ["ignore", log, log],
          detached: true,
          env: renderEnv,
        },
      );
      fs.closeSync(log);
      fs.writeFileSync(
        path.join(base, "latest.json"),
        JSON.stringify({ job, pid: child.pid, sourceHash: p.hash }),
      );
      child.on("exit", release);
      child.on("error", () => {
        fs.writeFileSync(
          path.join(dir, "status.json"),
          JSON.stringify({
            state: "failed",
            stage: "渲染进程启动失败",
            progress: 0,
            mode,
          }),
        );
        release();
      });
      return { id, job, mode };
    } catch (e) {
      try {
        fs.closeSync(fd);
      } catch {}
      release();
      throw e;
    }
  },
});
