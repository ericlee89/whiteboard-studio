import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { ownerKey } from "../server/studio-store";
export default defineAction({
  description:
    "Request cancellation of the current project's local render; the owning runner stops its children and releases the job slot",
  schema: z.object({
    id: z
      .string()
      .regex(/^[a-z0-9-]{1,80}$/)
      .describe("Project id"),
  }),
  run: async ({ id }, ctx) => {
    const base = path.resolve("data/jobs", ownerKey(ctx?.userEmail), id);
    let latest: { job: string; pid: number };
    try {
      latest = JSON.parse(
        await readFile(path.join(base, "latest.json"), "utf8"),
      );
    } catch {
      return fail("没有渲染任务", { statusCode: 404, errorCode: "NOT_FOUND" });
    }
    const statusFile = path.join(base, latest.job, "status.json"),
      s = JSON.parse(await readFile(statusFile, "utf8"));
    if (s.state !== "running") return { id, state: s.state };
    // A per-job flag is portable and never grants an HTTP caller permission to
    // kill an arbitrary/reused PID. The live runner owns and stops its children.
    await writeFile(
      path.join(base, latest.job, "cancel.requested"),
      "cancel\n",
    );
    return { id, state: "cancelling" };
  },
});
