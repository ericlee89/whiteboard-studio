import { defineAction, fail } from "@agent-native/core/action";
import { z } from "zod";
import { episodeSchema } from "../shared/studio";
import { saveEpisode, ownerKey, loadEpisode } from "../server/studio-store";
export default defineAction({
  description:
    "Create or update a whiteboard project with safe structured scenes; existing edits require the current hash",
  schema: z.object({
    episode: episodeSchema,
    hash: z
      .string()
      .optional()
      .describe("Current file hash; required to update existing project"),
  }),
  run: async ({ episode, hash }, ctx) => {
    const owner = ownerKey(ctx?.userEmail);
    const old = await loadEpisode(owner, episode.id);
    if (old && old.hash !== hash)
      return fail("项目已更新，请刷新后再保存", {
        statusCode: 409,
        errorCode: "CONFLICT",
      });
    try {
      await saveEpisode(owner, episode, hash);
    } catch {
      return fail("保存冲突，请刷新项目", {
        statusCode: 409,
        errorCode: "CONFLICT",
      });
    }
    return (await loadEpisode(owner, episode.id))!;
  },
});
