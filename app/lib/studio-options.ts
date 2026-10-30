import type { Episode } from "../../shared/studio";

export type StyleId = Episode["style"];
export type EngineId = Episode["engine"];

/** 画面风格小样：纸色、点阵、字体都与引擎预设一一对应 */
export const STYLE_PRESETS = [
  {
    id: "kai",
    name: "楷体",
    note: "暖米黄 · 点阵",
    paper: "#f7f1e3",
    dot: "#e3d9c4",
    dots: true,
    font: "StudioKai",
  },
  {
    id: "classic",
    name: "手写体",
    note: "米白 · 点阵",
    paper: "#fffdf7",
    dot: "#d9d4c7",
    dots: true,
    font: "StudioHand",
  },
  {
    id: "training",
    name: "苹方江南",
    note: "纯白 · 投屏",
    paper: "#ffffff",
    dot: "#e8e8e8",
    dots: false,
    font: "StudioJiangNan",
  },
  {
    id: "culture",
    name: "苹方相思",
    note: "暖米黄 · 点阵",
    paper: "#f7f1e3",
    dot: "#e3d9c4",
    dots: true,
    font: "StudioXiangSi",
  },
  {
    id: "office",
    name: "苹方江南",
    note: "冷浅灰 · 无点阵",
    paper: "#f3f5f7",
    dot: "#dfe3e6",
    dots: false,
    font: "StudioJiangNan",
  },
] as const;

export const ENGINE_PRESETS = [
  { id: "edge", name: "Edge", note: "免费 · 联网即用", voice: "zh-CN-YunxiNeural" },
  { id: "volc", name: "火山引擎", note: "音质最好", voice: "zh_male_liufei_uranus_bigtts" },
  { id: "mi", name: "小米 MiMo", note: "九种音色", voice: "冰糖" },
] as const;

/** 已知音色；火山音色 ID 太多且随账号不同，保留手填 */
export const VOICE_PRESETS: Record<string, { id: string; name: string }[]> = {
  edge: [
    { id: "zh-CN-YunxiNeural", name: "云希 · 男声" },
    { id: "zh-CN-YunjianNeural", name: "云健 · 男声" },
    { id: "zh-CN-XiaoxiaoNeural", name: "晓晓 · 女声" },
    { id: "zh-CN-XiaoyiNeural", name: "晓伊 · 女声" },
  ],
  mi: [
    { id: "冰糖", name: "冰糖" },
    { id: "茉莉", name: "茉莉" },
    { id: "苏打", name: "苏打" },
    { id: "白桦", name: "白桦" },
    { id: "Mia", name: "Mia" },
    { id: "Chloe", name: "Chloe" },
    { id: "Milo", name: "Milo" },
    { id: "Dean", name: "Dean" },
  ],
};
