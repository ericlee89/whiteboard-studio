import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { readFile, readdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { ownerKey, loadEpisode } from "../server/studio-store";
export default defineAction({
  description: "Read actual render progress, logs, and generated downloads",
  schema: z.object({
    id: z
      .string()
      .regex(/^[a-z0-9-]{1,80}$/)
      .describe("Project id"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ id }, ctx) => {
    const base = path.resolve("data/jobs", ownerKey(ctx?.userEmail), id);
    let latest: { job: string; pid: number; sourceHash?: string };
    try {
      latest = JSON.parse(
        await readFile(path.join(base, "latest.json"), "utf8"),
      );
    } catch {
      return {
        state: "idle",
        stage: "尚未导出",
        progress: 0,
        files: [] as { name: string; url: string }[],
        log: "",
      };
    }
    const dir = path.join(base, latest.job);
    let s = JSON.parse(await readFile(path.join(dir, "status.json"), "utf8"));
    if (s.state === "running") {
      try {
        process.kill(latest.pid, 0);
      } catch {
        s = { ...s, state: "failed", stage: "任务已中断，可重试" };
        await unlink(path.join(base, "lock")).catch(() => {});
        await writeFile(path.join(dir, "status.json"), JSON.stringify(s));
      }
    }
    const logs = await readFile(path.join(dir, "render.log"), "utf8").catch(
      () => "",
    );
    const files: { name: string; url: string }[] = [];
    async function scan(rel: string) {
      const entries = await readdir(path.join(dir, rel), {
        withFileTypes: true,
      }).catch(() => []);
      for (const f of entries) {
        // Relative download paths are URL paths on every host, including Windows.
        const r = path.posix.join(rel, f.name);
        if (f.isDirectory()) {
          if (!["node_modules", "audio", "raw", "out"].includes(f.name))
            await scan(r);
        } else if (/\.(png|mp4|srt|md)$/.test(f.name))
          files.push({
            name: f.name,
            url: `/studio-file?id=${id}&job=${latest.job}&file=${encodeURIComponent(r)}`,
          });
      }
    }
    await scan("engine/episodes");
    await scan("engine/build");
    const current = await loadEpisode(ownerKey(ctx?.userEmail), id);
    return {
      ...s,
      outdated: Boolean(
        latest.sourceHash && current?.hash !== latest.sourceHash,
      ),
      log: logs
        .slice(-6000)
        .replace(/(?:sk-|tp-|ark-)[a-zA-Z0-9_-]{12,}/g, "[已隐藏]"),
      files,
    };
  },
});
