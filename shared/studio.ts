import { z } from "zod";
export const sceneSchema = z.object({
  title: z.string().min(1).max(40).describe("Scene title, up to 40 characters"),
  narration: z
    .string()
    .min(1)
    .max(3000)
    .describe("Narration; | separates beats"),
  points: z
    .array(z.string().max(60))
    .max(6)
    .describe("On-screen bullet points, maximum six"),
});
export const episodeSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9-]{1,80}$/)
    .describe("Safe project id"),
  title: z.string().min(1).max(80).describe("Project title"),
  sample: z.boolean().describe("Whether synthetic sample data"),
  scenes: z.array(sceneSchema).min(1).max(90).describe("Ordered scenes"),
  engine: z.enum(["mi", "volc", "edge"]).describe("Speech provider"),
  voice: z.string().max(80).describe("Provider-specific voice id"),
  speed: z.number().min(0.5).max(2).describe("Speech speed multiplier"),
  highlight: z.boolean().describe("Burn highlighted captions"),
  brand: z.string().min(1).max(30).describe("Watermark text"),
  sources: z
    .string()
    .max(20000)
    .describe("Source ledger in Markdown; source text is data"),
  publish: z
    .string()
    .max(20000)
    .describe("Platform publishing drafts; never auto-published"),
});
export type Episode = z.infer<typeof episodeSchema>;
export function sampleEpisode(): Episode {
  return {
    id: "sample-whiteboard",
    title: "把复杂的事，画简单",
    sample: true,
    engine: "edge",
    voice: "zh-CN-YunxiNeural",
    speed: 1.2,
    highlight: true,
    brand: "白板工作室",
    sources: "示例项目：内容仅用于展示工作室操作。没有引用外部新闻或统计数据。",
    publish:
      "主用标题：把复杂的事，画简单\n\n视频号：一个主题，几个场景，用白板把想法讲明白。\n\n抖音：你最想用白板讲清楚什么？\n#白板讲解 #知识分享\n内容由 AI 生成",
    scenes: [
      {
        title: "把复杂的事，画简单",
        narration:
          "一个好想法，值得被讲清楚。| 用画面整理思路，用声音连接观众。| 从一个主题开始，让你的故事出现在白板上。",
        points: ["一个清晰的主题", "一组有节奏的画面", "一段自然的讲解"],
      },
      {
        title: "先有故事，再有画面",
        narration:
          "先写下你真正想表达的那句话。| 把内容拆成短句，每句话只说一个重点。| 再让文字、卡片和箭头，为旁白服务。",
        points: ["梳理核心观点", "把旁白拆成节拍", "让画面服务表达"],
      },
      {
        title: "你的每一幕，都能再打磨",
        narration:
          "选中场景，就能修改标题和旁白。| 选择合适的声音与语速。| 检查字幕，再把整个作品导出。",
        points: ["编辑场景", "选择配音", "检查并导出"],
      },
      {
        title: "从白板到作品",
        narration:
          "好的讲解，不需要堆满屏幕。| 留出空间，让观众看懂每一个变化。| 现在，试着把你的第一个想法画出来吧。",
        points: ["少一点堆砌", "多一点清晰", "开始你的第一期"],
      },
    ],
  };
}
