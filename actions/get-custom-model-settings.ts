import { defineAction, fail } from "@agent-native/core/action";
import { getUserSetting, getOrgSetting } from "@agent-native/core/settings";
import { z } from "zod";
export default defineAction({
  description:
    "Read custom model id and display name only; never returns API keys",
  schema: z.object({
    scope: z.enum(["user", "org"]).describe("Personal or organization scope"),
  }),
  http: { method: "GET" },
  readOnly: true,
  run: async ({ scope }, ctx) => {
    if (!ctx?.userEmail) fail("Sign in required", { statusCode: 401 });
    if (scope === "org" && !ctx?.orgId) return { modelId: "", label: "" };
    const value =
      scope === "org"
        ? await getOrgSetting(ctx!.orgId!, "studio.custom-model")
        : await getUserSetting(ctx!.userEmail!, "studio.custom-model");
    return {
      modelId: typeof value?.modelId === "string" ? value.modelId : "",
      label: typeof value?.label === "string" ? value.label : "",
    };
  },
});
