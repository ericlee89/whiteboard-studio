import type { Episode } from "../../shared/studio";

export type MaterialKind = "image" | "video";
export type MaterialLevel = "top" | "high" | "low" | "none";

export interface MaterialHint {
  index: number;
  title: string;
  /** 建议补的素材类型；null 表示这一幕不建议配素材 */
  kind: MaterialKind | null;
  level: MaterialLevel;
  reason: string;
  current: {
    file: string;
    fit: "side" | "full";
    type: "image" | "video";
  } | null;
  /** 这一幕选的版式，用于提示「配了素材后版式会退回清单」 */
  layout: string;
  /** 版式与素材同时存在，渲染时版式会被忽略 */
  conflict: boolean;
}

/**
 * 从旁白里判断这一幕缺什么素材。
 *
 * 这是纯启发式，没有接模型：命中"操作过程"类词就给视频，命中"界面步骤"类词就给截图。
 * 准头有限，但足够把「哪几幕值得配图」这件事说清楚。接入模型后可以整体替换。
 */
const VIDEO_HINTS =
  /录屏|演示|操作过程|动画效果|录制|实操|短视频|一段视频|播放/;
const IMAGE_HINTS =
  /界面|页面|设置|配置|截图|流程|步骤|点击|输入|列表|表格|字段|面板|菜单|按钮|启动|端口|浏览器|终端|命令|登录|预览|上传|下载/;

const LAYOUT_NAME: Record<string, string> = {
  split: "左右对比",
  columns: "三栏卡片",
  summary: "大字总结",
  hero: "开场大标题",
};

export function planMaterials(episode: Episode): MaterialHint[] {
  const total = episode.scenes.length;

  return episode.scenes.map((scene, index) => {
    const haystack = [scene.title, scene.narration, ...scene.points].join(" ");
    const current = scene.video
      ? {
          file: scene.video.file,
          fit: scene.video.fit,
          type: "video" as const,
        }
      : scene.image
        ? { file: scene.image.file, fit: scene.image.fit, type: "image" as const }
        : null;
    const layout = scene.layout ?? "list";
    // 渲染器遇到素材会把版式强制退回清单；两样同时存在要提示，否则版式白选了
    const conflict = !!current && layout !== "list";
    const base = { index, title: scene.title, current, layout, conflict };

    if (current) {
      return {
        ...base,
        kind: current.type,
        level: "high" as const,
        reason: conflict
          ? `已配素材。这一幕的「${LAYOUT_NAME[layout] ?? layout}」版式会被素材顶掉，想要版式就先把素材移除`
          : "素材已就位",
      };
    }

    if (layout !== "list") {
      return {
        ...base,
        kind: null,
        level: "none" as const,
        reason: `这一幕用的是「${LAYOUT_NAME[layout] ?? layout}」版式，画面已经占满。想配素材就把版式切回清单`,
      };
    }

    if (VIDEO_HINTS.test(haystack)) {
      return {
        ...base,
        kind: "video" as const,
        level: "top" as const,
        reason: "这一幕讲的是操作过程，让画面动起来比一张截图有说服力",
      };
    }

    if (IMAGE_HINTS.test(haystack)) {
      return {
        ...base,
        kind: "image" as const,
        level: "high" as const,
        reason: "提到了具体界面或步骤，配一张截图能省掉一半解释",
      };
    }

    if (index === 0) {
      return {
        ...base,
        kind: null,
        level: "none" as const,
        reason: "开场用大标题就够，留白反而有力",
      };
    }

    if (index === total - 1) {
      return {
        ...base,
        kind: null,
        level: "none" as const,
        reason: "收尾收在结论上，不需要素材",
      };
    }

    return {
      ...base,
      kind: "image" as const,
      level: "low" as const,
      reason: "可选。有素材画面更饱满，没有也不影响理解",
    };
  });
}
