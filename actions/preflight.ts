import { defineAction, fail } from "@agent-native/core/action";
import { readAppSecret } from "@agent-native/core";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ownerKey, loadEpisode } from "../server/studio-store";

export interface PreflightIssue {
  level: "error" | "warn";
  /** 幕索引，缺省表示整期的问题 */
  scene?: number;
  title: string;
  detail: string;
}

/** 各版式一行要点能舒服放下的字数，超了会顶出边框 */
const POINT_CAPACITY: Record<string, number> = {
  list: 30,
  split: 15,
  columns: 8,
  summary: 14,
  hero: 10,
};

/** 单幕旁白超过这个字数，一屏讲不完，节奏会拖 */
const NARRATION_CAP = 150;

function envFileHas(key: string) {
  try {
    const txt = fs.readFileSync(path.resolve(".env"), "utf8");
    const m = txt.match(new RegExp(`^\\s*${key}\\s*=\\s*(\\S+)`, "m"));
    return !!m && m[1].trim().length > 0;
  } catch {
    return false;
  }
}

function edgeTtsReady() {
  try {
    execFileSync(
      process.platform === "win32" ? "python" : "python3",
      ["-c", "import edge_tts"],
      { stdio: "pipe", timeout: 8000 },
    );
    return true;
  } catch {
    return false;
  }
}

function fontExists(file: string) {
  const candidates = [
    path.resolve("engine/assets/fonts", file),
    path.resolve("data/assets/fonts", file),
  ];
  return candidates.some((p) => fs.existsSync(p));
}

function loadStyleConfig() {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.resolve("engine/config.json"), "utf8"),
    );
    const preset = cfg.style?.presets?.[cfg.style?.preset];
    return {
      fontFile: cfg.style?.override?.fontFile || preset?.fontFile || "",
    };
  } catch {
    return { fontFile: "" };
  }
}

export default defineAction({
  description:
    "Check an episode before rendering: speech credentials, asset files, narration beats, point lengths, fonts.",
  schema: z.object({
    id: z.string().regex(/^[a-z0-9-]{1,80}$/).describe("Project id"),
  }),
  readOnly: true,
  run: async ({ id }, ctx) => {
    const owner = ownerKey(ctx?.userEmail);
    const p = await loadEpisode(owner, id);
    if (!p) return fail("项目不存在", { statusCode: 404, errorCode: "NOT_FOUND" });

    const ep = p.episode;
    const issues: PreflightIssue[] = [];

    /* ---- 配音凭证 ---- */
    const hasSecret = async (key: string) => {
      if (envFileHas(key)) return true;
      try {
        const r = await readAppSecret({
          key,
          scope: "user",
          scopeId: ctx!.userEmail!,
        });
        return !!r?.value;
      } catch {
        return false;
      }
    };

    if (!ep.voice.trim()) {
      issues.push({
        level: "error",
        title: "没有选音色",
        detail: "配音引擎需要知道用哪个音色，否则合成会直接失败。",
      });
    }

    if (ep.engine === "volc" && !(await hasSecret("VOLC_TTS_API_KEY"))) {
      issues.push({
        level: "error",
        title: "火山引擎缺少 API Key",
        detail:
          "这个项目选了火山配音，但密钥库和项目根 .env 里都没有 Key。去设置 → API 密钥填一个，或者把配音引擎换成 Edge TTS。",
      });
    }
    if (ep.engine === "mi" && !(await hasSecret("MI_TTS_API_KEY"))) {
      issues.push({
        level: "error",
        title: "小米配音缺少 API Key",
        detail:
          "选了小米 MiMo，但没有可用的 Key。去设置 → API 密钥填一个，或者换成 Edge TTS。",
      });
    }
    if (ep.engine === "edge" && !edgeTtsReady()) {
      issues.push({
        level: "error",
        title: "Edge TTS 运行环境没装好",
        detail:
          "本机 Python 里没有 edge_tts 模块。跑一次 python -m pip install edge-tts，或者改用火山/小米配音。",
      });
    }

    /* ---- 素材文件 ---- */
    const assetDir = path.resolve("data/episodes", owner, `${id}.assets`);
    ep.scenes.forEach((s, i) => {
      const ref = s.video || s.image;
      if (!ref) return;
      const file = path.join(assetDir, ref.file);
      if (!fs.existsSync(file)) {
        issues.push({
          level: "error",
          scene: i,
          title: `第 ${i + 1} 幕的${s.video ? "视频" : "图片"}文件不见了`,
          detail: `项目里记着 ${ref.file}，但文件已经不在了。重新上传一次，或者把这一幕的素材移除。`,
        });
      }
    });

    /* ---- 版式与素材冲突 ---- */
    ep.scenes.forEach((s, i) => {
      if ((s.image || s.video) && (s.layout ?? "list") !== "list") {
        issues.push({
          level: "warn",
          scene: i,
          title: `第 ${i + 1} 幕的版式会被素材顶掉`,
          detail:
            "这一幕既选了非清单版式，又配了素材。渲染器会把版式换回清单，给素材腾位置。",
        });
      }
    });

    /* ---- 旁白 ---- */
    let totalChars = 0;
    ep.scenes.forEach((s, i) => {
      totalChars += s.narration.length;
      if (!s.narration.includes("|")) {
        issues.push({
          level: "warn",
          scene: i,
          title: `第 ${i + 1} 幕旁白没有节拍分隔符`,
          detail:
            "没有竖线就只有一个节拍，画面会一次性全部出现，没有逐笔的层次感。用半角 | 切成三到四拍。",
        });
      }
      if (s.narration.length > NARRATION_CAP) {
        issues.push({
          level: "warn",
          scene: i,
          title: `第 ${i + 1} 幕旁白偏长（${s.narration.length} 字）`,
          detail: `超过 ${NARRATION_CAP} 字，一屏讲不完，观众容易走神。建议拆成两幕，或者删掉次要信息。`,
        });
      }
    });

    /* ---- 要点长度 ---- */
    ep.scenes.forEach((s, i) => {
      const layout = (s.image || s.video) ? "list" : (s.layout ?? "list");
      const cap = POINT_CAPACITY[layout] ?? 30;
      const over = s.points.filter((pt) => pt.length > cap);
      if (over.length) {
        issues.push({
          level: "warn",
          scene: i,
          title: `第 ${i + 1} 幕有 ${over.length} 条要点超出宽度`,
          detail: `当前版式一行大约放得下 ${cap} 字，这条有 ${over[0].length} 字，会顶出边框。精简一下，或者换成清单版式。`,
        });
      }
    });

    /* ---- 字体 ---- */
    const { fontFile } = loadStyleConfig();
    if (fontFile && !fontExists(fontFile)) {
      issues.push({
        level: "error",
        title: `画面字体缺失：${fontFile}`,
        detail:
          "风格配置里指定的字体文件在 engine/assets/fonts 下找不到，渲染会取不到字。把字体放回去，或者换一套预设。",
      });
    }

    return {
      issues,
      errors: issues.filter((i) => i.level === "error").length,
      warnings: issues.filter((i) => i.level === "warn").length,
      totalChars,
      /** 按每秒 4.5 字粗估，用于确认总时长是否跑偏 */
      estimatedSeconds: Math.round(totalChars / 4.5),
    };
  },
});
