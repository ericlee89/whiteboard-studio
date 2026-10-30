import { useState } from "react";
import {
  IconLoader2,
  IconSparkles,
  IconUpload,
  IconFileText,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Episode } from "../../../shared/studio";

type Stage = "form" | "loading" | "result";

interface Draft {
  title: string;
  scenes: Episode["scenes"];
  characters: number;
  estimatedSeconds: number;
}

const LENGTHS = [1, 2, 3, 5];

export function GeneratePanel({
  episodeId,
  sceneCount,
  savedModel,
  onClose,
  onApply,
}: {
  episodeId: string;
  sceneCount: number;
  /** 项目里记住的模型名，优先于本地缓存 */
  savedModel?: string;
  onClose: () => void;
  onApply: (
    title: string,
    scenes: Episode["scenes"],
    model: string,
  ) => void;
}) {
  const [stage, setStage] = useState<Stage>("form");
  const [brief, setBrief] = useState("");
  const [minutes, setMinutes] = useState(2);
  const [briefFile, setBriefFile] = useState<string | null>(null);
  const [briefInfo, setBriefInfo] = useState<{
    name: string;
    chars: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [extra, setExtra] = useState("");
  const [model, setModel] = useState(() => {
    // 项目里记的优先，其次是本地缓存，都没有就交给框架默认
    if (savedModel) return savedModel;
    try {
      return localStorage.getItem("studio.gen.model") || "";
    } catch {
      return "";
    }
  });
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const upload = async (file: File) => {
    setError("");
    setUploading(true);
    try {
      const res = await fetch(
        `/studio-brief?id=${encodeURIComponent(episodeId)}&filename=${encodeURIComponent(file.name)}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: await file.arrayBuffer(),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        file?: string;
        chars?: number;
        message?: string;
        statusMessage?: string;
      };
      if (!res.ok || !body.file) {
        throw new Error(
          body.statusMessage || body.message || `上传失败（${res.status}）`,
        );
      }
      setBriefFile(body.file);
      setBriefInfo({ name: file.name, chars: body.chars ?? 0 });
    } catch (e) {
      setError(e instanceof Error ? e.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const run = async () => {
    setError("");
    if (brief.trim().length < 4) {
      setError("先写一句主题，至少四个字");
      return;
    }
    setStage("loading");
    try {
      try {
        localStorage.setItem("studio.gen.model", model.trim());
      } catch {
        // 记不住也不影响这次生成
      }
      const res = await fetch("/_agent-native/actions/generate-episode", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          brief: brief.trim(),
          minutes,
          extra: extra.trim() || undefined,
          model: model.trim() || undefined,
          id: episodeId,
          briefFile: briefFile || undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        title?: string;
        scenes?: Episode["scenes"];
        characters?: number;
        estimatedSeconds?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok || !body.scenes?.length) {
        throw new Error(
          body.error || body.message || `生成失败（${res.status}）`,
        );
      }
      setDraft({
        title: body.title || brief.trim(),
        scenes: body.scenes,
        characters: body.characters ?? 0,
        estimatedSeconds: body.estimatedSeconds ?? 0,
      });
      setStage("result");
    } catch (e) {
      setError(e instanceof Error ? e.message : "生成失败");
      setStage("form");
    }
  };

  const min = draft ? Math.floor(draft.estimatedSeconds / 60) : 0;
  const sec = draft ? draft.estimatedSeconds % 60 : 0;

  return (
    <div className="setup-mask" role="dialog" aria-modal="true">
      <div className="setup-card gen-card">
        <header className="setup-head">
          <h2>生成整期分镜</h2>
          <p>
            {stage === "result"
              ? "看一眼结构和节奏，满意就套用。套用会替换当前全部内容。"
              : "说一句要讲什么，旁白和画面要点都由它来写。之后再逐幕微调。"}
          </p>
        </header>

        {stage === "form" && (
          <>
            <div className="gen-field">
              <label htmlFor="gen-brief">讲什么</label>
              <Input
                id="gen-brief"
                placeholder="例如：给新同事讲清楚我们的报修工单怎么流转"
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
              />
            </div>
            <div className="gen-field">
              <label>参考资料（可不填）</label>
              {briefInfo ? (
                <div className="brief-chip">
                  <IconFileText size={14} />
                  <span className="brief-name">{briefInfo.name}</span>
                  <em>{briefInfo.chars} 字</em>
                  <button
                    aria-label="移除资料"
                    onClick={() => {
                      setBriefFile(null);
                      setBriefInfo(null);
                    }}
                  >
                    <IconX size={13} />
                  </button>
                </div>
              ) : (
                <label
                  className={`material-drop${uploading ? " is-busy" : ""}`}
                >
                  <input
                    type="file"
                    accept=".docx,.pptx,.xlsx,.txt,.md,.markdown,.html,.htm"
                    disabled={uploading}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      e.target.value = "";
                      if (f) await upload(f);
                    }}
                  />
                  <IconUpload size={14} />
                  {uploading ? "解析中…" : "上传 Word / PPT / 网页 / 文本"}
                </label>
              )}
              <p className="field-hint">
                文档会解析成文字一起交给模型，事实以资料为准。PDF 请先另存为 Word。
              </p>
            </div>
            <div className="gen-field">
              <label>多长</label>
              <div className="gen-lengths">
                {LENGTHS.map((m) => (
                  <button
                    key={m}
                    className={`gen-length${minutes === m ? " is-on" : ""}`}
                    onClick={() => setMinutes(m)}
                  >
                    {m} 分钟
                  </button>
                ))}
              </div>
            </div>
            <div className="gen-field">
              <label htmlFor="gen-extra">补充要求（可不填）</label>
              <Textarea
                id="gen-extra"
                rows={3}
                placeholder="受众是谁、语气要正式还是随意、有哪些必须讲到"
                value={extra}
                onChange={(e) => setExtra(e.target.value)}
              />
            </div>
            <div className="gen-field">
              <label htmlFor="gen-model">模型（可不填）</label>
              <Input
                id="gen-model"
                placeholder="留空用设置里的默认模型"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
              <p className="field-hint">
                如果报「没有可用通道」，说明默认模型名在你这个服务商不存在，在这里填上实际可用的名字。
              </p>
            </div>
          </>
        )}

        {stage === "loading" && (
          <div className="gen-loading">
            <IconLoader2 size={22} className="setup-spin" />
            <p>正在写分镜，大约半分钟</p>
            <small>写完会在下面列出每一幕，先看再决定用不用</small>
          </div>
        )}

        {stage === "result" && draft && (
          <>
            <div className="gen-meta">
              <IconSparkles size={14} />
              {draft.scenes.length} 幕 · 预计 {min} 分 {sec} 秒 · 全片{" "}
              {draft.characters} 字
            </div>
            <ul className="gen-scenes">
              {draft.scenes.map((s, i) => (
                <li key={i} className="gen-scene">
                  <div className="gen-scene-head">
                    <span className="gen-no">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <strong>{s.title}</strong>
                    <em>{s.layout ?? "list"}</em>
                  </div>
                  <p className="gen-narration">{s.narration}</p>
                  <div className="gen-points">
                    {s.points.map((p, k) => (
                      <span key={k}>{p}</span>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}

        {error && <p className="setup-error">{error}</p>}

        <footer className="setup-foot">
          {stage === "form" && (
            <>
              <Button variant="ghost" onClick={onClose}>
                取消
              </Button>
              <Button onClick={() => void run()}>开始生成</Button>
            </>
          )}
          {stage === "loading" && (
            <Button variant="ghost" onClick={onClose}>
              取消
            </Button>
          )}
          {stage === "result" && (
            <>
              <Button variant="ghost" onClick={() => void run()}>
                重新生成
              </Button>
              <Button
                onClick={() => {
                  if (draft) onApply(draft.title, draft.scenes, model.trim());
                }}
              >
                用这个分镜（替换 {sceneCount} 幕）
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );
}
