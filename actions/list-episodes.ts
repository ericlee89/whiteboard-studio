import { defineAction } from "@agent-native/core/action";
import { z } from "zod";
import { episodes, ownerKey } from "../server/studio-store";
export default defineAction({
  description: "List local whiteboard projects and their editable scenes",
  schema: z.object({}),
  http: { method: "GET" },
  readOnly: true,
  run: async (_, ctx) => ({
    items: (await episodes(ownerKey(ctx?.userEmail))).filter(Boolean),
  }),
});
