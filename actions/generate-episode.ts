import { defineAction, fail } from "@agent-native/core/action";
import { completeText } from "@agent-native/core/server";
import { z } from "zod";
import { sceneSchema, type Episode } from "../shared/studio";

const LAYOUTS = ["list", "split", "columns", "summary", "hero"] as const;

const SYSTEM_PROMPT = `你是白板手绘讲解视频的分镜编剧。用户给一个主题，你写出一期可以直接渲染成片的分镜。

写作规则：
1. 篇幅：按每分钟约 260 字旁白估算，2 分钟大约 7 到 8 幕。
2. 每幕的 narration 用半角竖线 | 切成 3 到 4 个节拍，每个节拍是一句完整的话，20 到 40 字。竖线是节拍分隔符，决定画面一层层出现，所以每一拍只讲一件事。
3. 每幕给 3 条 points，每条 8 到 16 个字。要点是关键词，不是把旁白复述一遍。字数超了会在画面上顶出边框。
4. 版式安排：第一幕用 hero（开场大标题），最后一幕用 summary（收束金句）。
   中间各幕在 list、split、columns 里挑最贴合的：
   - list：逐条罗列几件事
   - split：两组对比或前后变化，要点前一半在左、后一半在右
   - columns：三个并列要素，此时 points 只写三条短的
5. 语气像跟人聊天，口语、短句，不要书面语、排比句和"首先其次最后"。
6. 不编造具体数字、人名、机构名。确实需要数据时用"大概""通常"这类模糊表述。

只输出 JSON，不要 markdown 代码块，不要任何解释或前后缀：
{"title":"整期标题","scenes":[{"title":"这一幕的标题","narration":"第一拍。|第二拍。|第三拍。","points":["要点一","要点二","要点三"],"layout":"hero"}]}`;

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型没有返回 JSON 结构");
  return JSON.parse(raw.slice(start, end + 1));
}

export default defineAction({
  description:
    "Draft a full episode storyboard from a one-line brief: scene titles, narration beats, on-screen points and layouts.",
  schema: z.object({
    brief: z.string().min(4).max(600).describe("Topic / what the video should explain"),
    minutes: z.number().min(0.5).max(10).default(2).describe("Target length in minutes"),
    extra: z.string().max(600).optional().describe("Audience, tone or must-cover points"),
  }),
  run: async ({ brief, minutes, extra }) => {
    let text: string;
    try {
      const res = await completeText({
        appId: "whiteboard-studio",
        systemPrompt: SYSTEM_PROMPT,
        input: [
          `主题：${brief}`,
          `目标时长：${minutes} 分钟`,
          extra ? `补充要求：${extra}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        temperature: 0.75,
        maxOutputTokens: 6000,
        timeoutMs: 180000,
      });
      text = res.text;
    } catch (e) {
      return fail(
        `模型调用失败：${e instanceof Error ? e.message : "未知错误"}。先确认设置里的模型可以正常对话。`,
        { statusCode: 502, errorCode: "MODEL_FAILED" },
      );
    }

    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch (e) {
      return fail(
        `模型返回的内容不是合法 JSON（${e instanceof Error ? e.message : "解析失败"}）。换一次再试，或者换个模型。`,
        { statusCode: 502, errorCode: "BAD_JSON" },
      );
    }

    const shape = z
      .object({
        title: z.string().min(1).max(80),
        scenes: z.array(sceneSchema).min(1).max(30),
      })
      .safeParse(parsed);

    if (!shape.success) {
      const first = shape.error.issues[0];
      return fail(
        `分镜结构不符合要求：${first?.path.join(".") || ""} ${first?.message || ""}`,
        { statusCode: 502, errorCode: "BAD_SHAPE" },
      );
    }

    const scenes = shape.data.scenes.map((s) => ({
      ...s,
      layout: (LAYOUTS as readonly string[]).includes(s.layout) ? s.layout : "list",
      image: null,
      video: null,
    })) as Episode["scenes"];

    const chars = scenes.reduce((a, s) => a + s.narration.length, 0);

    return {
      title: shape.data.title,
      scenes,
      characters: chars,
      estimatedSeconds: Math.round(chars / 4.5),
    };
  },
});
