import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { ownerKey, loadEpisode } from "../server/studio-store";

/**
 * 彻底删除一个项目：剧集文件、上传的素材、渲染产物。
 *
 * 路径全部由 owner（邮箱哈希）和 id（正则校验）拼出来，不接受任何外部路径，
 * 因此不存在越界删除的可能。删掉之后无法恢复，前端必须二次确认。
 */
export default defineAction({
  description:
    "Delete a project together with its uploaded assets and render outputs. Irreversible.",
  schema: z.object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/).describe("Project id"),
  }),
  run: async ({ id }, ctx) => {
    const owner = ownerKey(ctx?.userEmail);
    const p = await loadEpisode(owner, id);
    if (!p) return fail("项目不存在", { statusCode: 404, errorCode: "NOT_FOUND" });

    const targets = [
      path.resolve("data/episodes", owner, `${id}.json`),
      path.resolve("data/episodes", owner, `${id}.assets`),
      path.resolve("data/jobs", owner, id),
    ];

    const removed: string[] = [];
    for (const t of targets) {
      if (!fs.existsSync(t)) continue;
      fs.rmSync(t, { recursive: true, force: true });
      removed.push(path.basename(t));
    }

    return { id, removed };
  },
});
