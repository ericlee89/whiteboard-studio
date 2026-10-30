import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import {
  useSetHeaderActions,
  useSetPageTitle,
} from "@agent-native/toolkit/app-shell";
import {
  useActionQuery,
  useActionMutation,
  actionErrorMessage,
  writeClientAppState,
} from "@agent-native/core/client/hooks";
import { sendToAgentChat } from "@agent-native/core/client/agent-chat";
import {
  IconPlayerPlay,
  IconPlus,
  IconMovie,
  IconDownload,
  IconCheck,
  IconDeviceFloppy,
  IconPencil,
  IconSettings,
  IconVolume,
  IconArrowRight,
  IconLayoutBoard,
  IconFileText,
  IconRefresh,
  IconDots,
  IconPhoto,
  IconChevronDown,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { MaterialPanel } from "@/components/studio/MaterialPanel";
import { FirstRunSetup } from "@/components/studio/FirstRunSetup";
import {
  PreflightPanel,
  type PreflightResult,
} from "@/components/studio/PreflightPanel";
import { GeneratePanel } from "@/components/studio/GeneratePanel";
import { TtsPicker, type TtsChoice } from "@/components/studio/TtsPicker";
import { planMaterials } from "@/lib/material-plan";
import {
  STYLE_PRESETS,
  ENGINE_PRESETS,
  VOICE_PRESETS,
} from "@/lib/studio-options";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  DialogHeader,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Episode } from "../../shared/studio";
import "../studio.css";

export function meta() {
  return [{ title: "白板工作室 · Whiteboard Studio" }];
}
function Board({
  episode,
  index,
  small = false,
}: {
  episode: Episode;
  index: number;
  small?: boolean;
}) {
  const s = (episode.scenes[index] || episode.scenes[0])!;
  return (
    <svg
      viewBox="0 0 1920 1080"
      role="img"
      aria-label={s.title}
      className="whiteboard"
    >
      <defs>
        <pattern
          id={small ? "mini-grid" : "dot-grid"}
          width="36"
          height="36"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="2" cy="2" r="1.3" fill="#d7dbd2" />
        </pattern>
      </defs>
      <rect width="1920" height="1080" fill="#fffef9" />
      <rect
        width="1920"
        height="1080"
        fill={`url(#${small ? "mini-grid" : "dot-grid"})`}
      />
      <text x="1755" y="90" textAnchor="end" fill="#69806b" fontSize="30">
        {episode.brand}
      </text>
      <text
        x="960"
        y="194"
        textAnchor="middle"
        fill="#285c38"
        fontSize="76"
        fontWeight="600"
      >
        {s.title}
      </text>
      <path
        d="M 540 230 Q 940 255 1370 222"
        stroke="#b9d87c"
        strokeWidth="18"
        fill="none"
        strokeLinecap="round"
      />
      {s.points.slice(0, 6).map((p, i) => {
        const x = 220 + (i % 3) * 520,
          y = 370 + Math.floor(i / 3) * 270;
        return (
          <g key={i}>
            <path
              d={`M${x + 3} ${y} L${x + 440} ${y - 4} L${x + 446} ${y + 174} L${x} ${y + 180} Z`}
              fill={["#edf5d7", "#e5f0fb", "#fff1ca"][i % 3]}
              stroke="#34463b"
              strokeWidth="3"
            />
            <circle
              cx={x + 220}
              cy={y + 46}
              r="25"
              fill="#fffef9"
              stroke="#34463b"
              strokeWidth="2"
            />
            <text
              x={x + 220}
              y={y + 55}
              textAnchor="middle"
              fontSize="26"
              fill="#34463b"
            >
              {i + 1}
            </text>
            <text
              x={x + 220}
              y={y + 123}
              textAnchor="middle"
              fill="#34463b"
              fontSize={p.length > 12 ? 25 : 34}
            >
              {p.slice(0, 20)}
            </text>
            {i % 3 < 2 && i < s.points.length - 1 && (
              <path
                d={`M${x + 460} ${y + 85} l40 0 m-12 -12 l12 12 -12 12`}
                stroke="#34463b"
                strokeWidth="3"
                fill="none"
              />
            )}
          </g>
        );
      })}
      <text x="960" y="1005" textAnchor="middle" fill="#70776c" fontSize="26">
        {(s.narration.split("|")[0] || "").slice(0, 45)}
      </text>
    </svg>
  );
}
export default function Studio() {
  const [params, setParams] = useSearchParams();
  const id = params.get("id") || "sample-whiteboard",
    index = Math.max(0, Math.floor(Number(params.get("scene") || 0))) || 0;
  const q = useActionQuery("list-episodes", {});
  const [draft, setDraft] = useState<Episode | null>(null),
    [hash, setHash] = useState<string | undefined>(),
    [tab, setTab] = useState("material"),
    [dirty, setDirty] = useState(false),
    [newTitle, setNewTitle] = useState(""),
    [open, setOpen] = useState(false),
    [playing, setPlaying] = useState(false),
    [uploading, setUploading] = useState(false),
    [jobOpen, setJobOpen] = useState(true),
    [check, setCheck] = useState<PreflightResult | null>(null),
    [genOpen, setGenOpen] = useState(false),
    [ttsOpen, setTtsOpen] = useState(false);
  const cancel = useActionMutation("cancel-render");
  const preflight = useActionMutation("preflight");
  const save = useActionMutation("save-episode"),
    render = useActionMutation("start-render");
  const status = useActionQuery(
    "render-status",
    { id },
    { refetchInterval: 3000 },
  );
  const items = (q.data?.items || []) as { episode: Episode; hash: string }[];
  const current = items.find((x) => x.episode.id === id) || items[0];
  useEffect(() => {
    if (current) {
      setDraft(current.episode);
      setHash(current.hash);
      setDirty(false);
    }
  }, [current?.hash, current?.episode.id]);
  useEffect(() => {
    void writeClientAppState("whiteboard-selection", {
      view: "studio",
      episodeId: id,
      sceneIndex: index,
    }).catch(() => {});
  }, [id, index]);
  useEffect(() => {
    if (!playing || !draft) return;
    const timer = setInterval(
      () => setParams({ id, scene: String((index + 1) % draft.scenes.length) }),
      3500,
    );
    return () => clearInterval(timer);
  }, [playing, index, draft?.scenes.length]);
  const active = draft?.scenes[index] || draft?.scenes[0];
  const matPlan = draft ? planMaterials(draft) : [];
  const matNeeded = matPlan.filter((h) => h.level !== "none");
  const matDone = matNeeded.filter((h) => h.current);
  const totalChars = draft
    ? draft.scenes.reduce((a, s) => a + s.narration.length, 0)
    : 0;
  const estTotal = Math.round(totalChars / 4.5);
  const estMin = Math.floor(estTotal / 60);
  const estSec = estTotal % 60;
  const setEpisode = (e: Episode) => {
    setDraft(e);
    setDirty(true);
  };
  const edit = (patch: Partial<NonNullable<typeof active>>) => {
    if (!draft) return;
    const s = [...draft.scenes];
    s[Math.min(index, s.length - 1)] = { ...active!, ...patch };
    setEpisode({ ...draft, scenes: s });
  };
  // 素材面板按幕索引直接改，不依赖当前选中幕
  const setSceneAt = (
    at: number,
    patch: Partial<Episode["scenes"][number]>,
  ) => {
    if (!draft) return;
    const s = [...draft.scenes];
    s[at] = { ...s[at], ...patch };
    setEpisode({ ...draft, scenes: s });
  };
  const handleAttachAsset = async (
    at: number,
    kind: "image" | "video",
    file: File,
  ) => {
    if (!draft) return;
    try {
      const res = await fetch(
        `${kind === "video" ? "/studio-video" : "/studio-asset"}?id=${encodeURIComponent(draft.id)}`,
        {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: await file.arrayBuffer(),
        },
      );
      if (!res.ok) throw new Error(`上传失败（${res.status}）`);
      const { file: name } = await res.json();
      setSceneAt(
        at,
        kind === "video"
          ? { video: { file: name, fit: "side" }, image: null }
          : { image: { file: name, fit: "side" }, video: null },
      );
    } catch (err) {
      report(err);
    }
  };
  const handleRemoveAsset = async (at: number) => {
    if (!draft) return;
    const cur = draft.scenes[at]?.video || draft.scenes[at]?.image;
    if (cur) {
      try {
        await fetch(
          `/studio-asset?id=${encodeURIComponent(draft.id)}&file=${encodeURIComponent(cur.file)}`,
          { method: "DELETE", credentials: "same-origin" },
        );
      } catch {
        // 文件删不掉不影响从剧集里摘除引用
      }
    }
    setSceneAt(at, { image: null, video: null });
  };
  async function persist() {
    if (!draft) return;
    const result = await save.mutateAsync({ episode: draft, hash });
    setHash(result.hash);
    setDirty(false);
    await q.refetch();
    return result;
  }
  const report = (e: unknown) =>
    toast.error(actionErrorMessage(e) || String(e));
  async function start(
    mode: "build" | "preview",
    opts?: { skipPicker?: boolean; skipCheck?: boolean },
  ) {
    // 出片前先让人选配音，一次决定，后面不再打断
    if (mode === "build" && !opts?.skipPicker) {
      setTtsOpen(true);
      return;
    }
    try {
      await persist();
      // 出片前先体检，避免跑到一半才发现缺 Key、缺素材
      if (mode === "build" && !opts?.skipCheck) {
        const res = (await preflight.mutateAsync({
          id: draft!.id,
        })) as unknown as PreflightResult;
        if (res?.issues?.length) {
          setCheck(res);
          return;
        }
      }
      await render.mutateAsync({ id: draft!.id, mode });
      toast.success(mode === "build" ? "出片任务已开始" : "预览任务已开始");
      await status.refetch();
    } catch (e) {
      report(e);
    }
  }

  /** 选完配音后：先落盘（体检读的是服务端版本），再体检，最后开跑 */
  async function startWithTts(choice: TtsChoice) {
    setTtsOpen(false);
    if (!draft) return;
    const next: Episode = {
      ...draft,
      engine: choice.engine,
      voice: choice.voice,
      speed: choice.speed,
    };
    setEpisode(next);
    try {
      const saved = await save.mutateAsync({ episode: next, hash });
      setHash(saved.hash);
      setDirty(false);
      const res = (await preflight.mutateAsync({
        id: next.id,
      })) as unknown as PreflightResult;
      if (res?.issues?.length) {
        setCheck(res);
        return;
      }
      await render.mutateAsync({ id: next.id, mode: "build" });
      toast.success("出片任务已开始");
      await status.refetch();
      await q.refetch();
    } catch (e) {
      report(e);
    }
  }
  async function agent(verb: string) {
    if (!draft) return;
    if (dirty) {
      try {
        await persist();
      } catch (e) {
        report(e);
        return;
      }
    }
    sendToAgentChat({
      message: `请为当前白板项目${verb}。先读取 list-episodes，使用 save-episode 保存建议版本（保留当前 hash，sample 标记真实来源）。涉及新事实需给出来源。不要执行发布。`,
      context: JSON.stringify({
        id: draft.id,
        title: draft.title,
        sceneIndex: index,
        sceneTitle: active?.title,
      }),
      openSidebar: true,
      chatTarget: "local",
      submit: true,
    });
  }
  const header = (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        disabled={!dirty || save.isPending}
        onClick={() =>
          void persist()
            .then(() => toast.success("项目已保存"))
            .catch(report)
        }
      >
        <IconDeviceFloppy size={16} />
        <span className="hidden sm:inline">
          {dirty ? "保存修改" : "已保存"}
        </span>
      </Button>
      <Button
        size="sm"
        disabled={render.isPending || status.data?.state === "running"}
        onClick={() => void start("build")}
      >
        <IconMovie size={16} />
        一键出片
      </Button>
    </div>
  );
  useSetPageTitle(
    <span className="min-w-0 truncate" title={draft?.title || "白板工作室"}>
      {draft?.title || "白板工作室"}
    </span>,
  );
  useSetHeaderActions(header);
  if (q.error)
    return (
      <div className="p-8">
        项目读取失败：{actionErrorMessage(q.error)}
        <Button onClick={() => void q.refetch()}>重试</Button>
      </div>
    );
  if (!draft || !active)
    return (
      <div className="studio-loading">
        <div />
        <div />
        <div />
      </div>
    );
  const sceneIndex = Math.min(index, draft.scenes.length - 1);
  const mediaReady =
    !dirty && !status.data?.outdated && status.data?.state === "done";
  const renderedFrame = mediaReady
    ? (status.data?.files || [])
        .filter((f: { name: string }) =>
          f.name.startsWith(
            String(sceneIndex + 1).padStart(2, "0") + "-scene-beat",
          ),
        )
        .at(-1)
    : null;
  const renderedVideo = mediaReady
    ? (status.data?.files || []).find(
        (f: { name: string }) => f.name === "final.mp4",
      )
    : null;
  return (
    <div className="studio-shell">
      <aside className="project-rail">
        <div className="rail-label">
          <IconLayoutBoard size={16} />
          我的作品<span>{items.length}</span>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" className="w-full">
              <IconPlus size={16} />
              新建视频
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>新建白板视频</DialogTitle>
            </DialogHeader>
            <label htmlFor="project-title">视频主题</label>
            <Input
              id="project-title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="你想讲清楚什么？"
            />
            <Button
              disabled={!newTitle.trim() || save.isPending}
              onClick={async () => {
                try {
                  const ep: Episode = {
                    ...draft,
                    id: crypto.randomUUID(),
                    title: newTitle.trim(),
                    sample: false,
                    scenes: [
                      {
                        title: newTitle.trim().slice(0, 40),
                        narration: "请在这里写下第一段旁白。",
                        points: ["你的核心观点"],
                        layout: "list",
                        image: null,
                        video: null,
                      },
                    ],
                    sources: "",
                    publish: "",
                  };
                  await save.mutateAsync({ episode: ep });
                  setOpen(false);
                  setNewTitle("");
                  await q.refetch();
                  setParams({ id: ep.id, scene: "0" });
                } catch (e) {
                  report(e);
                }
              }}
            >
              创建项目
            </Button>
          </DialogContent>
        </Dialog>
        <div className="project-list">
          {items.map(({ episode: e }) => (
            <button
              key={e.id}
              className={
                e.id === draft.id ? "project-item active" : "project-item"
              }
              onClick={() => {
                if (dirty) {
                  toast.info("请先保存当前修改");
                  return;
                }
                setPlaying(false);
                setParams({ id: e.id, scene: "0" });
              }}
            >
              <div className="project-art">
                <IconMovie size={22} />
                <span>{e.scenes.length} 幕</span>
              </div>
              <strong>{e.title}</strong>
              <span>
                {e.sample ? "示例项目" : "本地项目"} ·{" "}
                {e.engine === "mi"
                  ? "小米 MiMo"
                  : e.engine === "edge"
                    ? "Edge TTS"
                    : "火山引擎"}
              </span>
            </button>
          ))}
        </div>
        <div className="rail-foot">
          <span className="local-dot" />
          本地文件模式
          <br />
          <a
            href="https://github.com/wwwzhouhui/skills_collection/tree/main/whiteboard-video-factory"
            target="_blank"
            rel="noreferrer"
          >
            基于 Whiteboard Video Factory ↗
          </a>
        </div>
      </aside>
      <section className="stage-pane">
        <div className="stage-top">
          <div className="stage-title">
            <h1>{draft.title}</h1>
            <span>
              {draft.scenes.length} 幕 · {dirty ? "有未保存修改" : "已保存"}
            </span>
          </div>
          <span className="stage-badge">{draft.sample ? "示例" : "本地"}</span>
          <span className="stage-dim">1920 × 1080 · 30 FPS</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void start("preview")}
            disabled={render.isPending || status.data?.state === "running"}
          >
            <IconRefresh size={15} />
            渲染预览
          </Button>
        </div>
        <div className="canvas-area">
          <div className="canvas-wrap">
            {renderedVideo ? (
              <video
                className="whiteboard"
                controls
                src={renderedVideo.url}
                aria-label="导出成片"
              />
            ) : renderedFrame ? (
              <img
                className="whiteboard"
                src={renderedFrame.url}
                alt={active.title + " 引擎渲染预览"}
              />
            ) : (
              <Board episode={draft} index={sceneIndex} />
            )}
          </div>
          <div className="canvas-caption">
            <IconPencil size={13} />
            {renderedVideo
              ? "实际导出成片"
              : renderedFrame
                ? "原引擎渲染预览"
                : "场景结构预览 · 正式逐笔动画以引擎渲染为准"}
            {matNeeded.length > 0 && (
              <button
                className="canvas-material-chip"
                onClick={() => setTab("material")}
                title="打开素材清单"
              >
                <IconPhoto size={12} />
                素材 {matDone.length}/{matNeeded.length}
              </button>
            )}
          </div>
        </div>
        <div className="transport">
          <button
            aria-label={playing ? "停止场景轮播" : "轮播场景"}
            onClick={() => setPlaying(!playing)}
            className="play-button"
          >
            <IconPlayerPlay size={17} />
          </button>
          <span>{playing ? "轮播中" : "场景浏览"}</span>
          <div className="transport-line">
            {draft.scenes.map((_, i) => (
              <button
                key={i}
                aria-label={`跳到场景 ${i + 1}`}
                onClick={() => setParams({ id: draft.id, scene: String(i) })}
                className={i === sceneIndex ? "on" : ""}
              />
            ))}
          </div>
          <span>
            {String(sceneIndex + 1).padStart(2, "0")} /{" "}
            {String(draft.scenes.length).padStart(2, "0")}
          </span>
        </div>
        <div className={`job-panel${jobOpen ? "" : " is-collapsed"}`}>
          <div className="job-bar">
            <IconMovie size={16} />
            <strong>{status.data?.stage || "尚未导出"}</strong>
            {status.data?.state === "running" && (
              <span className="job-pct">{status.data.progress}%</span>
            )}
            {status.data?.state === "running" && (
              <progress value={status.data.progress} max="100" />
            )}
            <div className="job-bar-actions">
              {status.data?.state === "running" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cancel.isPending}
                  onClick={() =>
                    void cancel
                      .mutateAsync({ id: draft.id })
                      .then(() => status.refetch())
                      .catch(report)
                  }
                >
                  取消任务
                </Button>
              )}
              <button
                className="job-toggle"
                onClick={() => setJobOpen(!jobOpen)}
                aria-expanded={jobOpen}
              >
                {jobOpen ? "收起" : "详情"}
                <IconChevronDown
                  size={14}
                  style={{
                    transform: jobOpen ? "rotate(180deg)" : "none",
                    transition: "transform .2s ease",
                  }}
                />
              </button>
            </div>
          </div>
          {jobOpen && (
            <div className="job-body">
              {status.data?.state === "failed" && (
                <p className="job-error">
                  任务未完成。查看日志，修正配音或运行配置后重试。
                </p>
              )}
              {status.data?.outdated && (
                <p className="field-hint">
                  项目有新修改，以下为历史导出；请重新渲染。
                </p>
              )}
              {(status.data?.files || []).length > 0 && (
                <div className="download-list">
                  {status.data.files
                    .filter((f: { name: string }) =>
                      /final.mp4|封面-|字幕.srt/.test(f.name),
                    )
                    .map((f: { name: string; url: string }) => (
                      <a
                        key={f.url}
                        href={f.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <IconDownload size={13} />
                        {f.name}
                      </a>
                    ))}
                </div>
              )}
              {status.data?.log && (
                <details>
                  <summary>渲染日志</summary>
                  <pre>{status.data.log}</pre>
                </details>
              )}
            </div>
          )}
        </div>
      </section>
      <aside className="inspector">
        <div className="inspector-tabs">
          {[
            ["material", "素材"],
            ["settings", "出片"],
            ["publish", "文案"],
          ].map(([k, v]) => (
            <button
              key={k}
              onClick={() => setTab(k!)}
              className={tab === k ? "active" : ""}
            >
              {v}
            </button>
          ))}
        </div>
        {tab === "material" ? (
          <div className="inspector-content">
            <MaterialPanel
              episode={draft}
              busy={uploading}
              onAttach={handleAttachAsset}
              onRemove={handleRemoveAsset}
            />
          </div>
        ) : tab === "settings" ? (
          <div className="inspector-content">
            <div className="field-heading">
              <span>画面风格</span>
            </div>
            <div className="style-list">
              {STYLE_PRESETS.map((st) => {
                const on = (draft.style ?? "kai") === st.id;
                return (
                  <button
                    key={st.id}
                    className={`style-card${on ? " is-on" : ""}`}
                    onClick={() => setEpisode({ ...draft, style: st.id })}
                  >
                    <span className="style-swatch" style={{ background: st.paper }}>
                      {st.dots && (
                        <span
                          className="style-dots"
                          style={{
                            backgroundImage: `radial-gradient(${st.dot} 1px, transparent 1px)`,
                          }}
                        />
                      )}
                      <em style={{ fontFamily: st.font }}>样</em>
                    </span>
                    <span className="style-text">
                      <strong>{st.name}</strong>
                      <small>{st.note}</small>
                    </span>
                    {on && <IconCheck size={14} />}
                  </button>
                );
              })}
            </div>

            <label className="check-line">
              <input
                type="checkbox"
                checked={draft.highlight}
                onChange={(e) =>
                  setEpisode({ ...draft, highlight: e.target.checked })
                }
              />
              字幕跟读高亮
            </label>
            <label htmlFor="brand">品牌水印</label>
            <Input
              id="brand"
              value={draft.brand}
              onChange={(e) => setEpisode({ ...draft, brand: e.target.value })}
            />
            <div className="duration-note">
              <IconMovie size={13} />
              预计 {estMin} 分 {estSec} 秒 · 全片 {totalChars} 字
            </div>
          </div>
        ) : (
          <div className="inspector-content">
            <label htmlFor="publish">平台发布草稿</label>
            <Textarea
              id="publish"
              rows={20}
              value={draft.publish}
              onChange={(e) =>
                setEpisode({ ...draft, publish: e.target.value })
              }
            />
            <Button
              variant="outline"
              onClick={() =>
                agent(
                  "起草视频号、抖音与小红书发布文案，保存到 publish 字段；保留 AIGC 标注",
                )
              }
            >
              <IconFileText size={15} />
              起草发布文案
            </Button>
            <p className="field-hint">草稿仅供复制，应用不会自动发布。</p>
          </div>
        )}
        <div className="inspector-bottom">
          <IconCheck size={14} />
          {dirty ? "有未保存修改" : "项目已保存到本地"}
        </div>
      </aside>
      <FirstRunSetup />
      {genOpen && (
        <GeneratePanel
          sceneCount={draft.scenes.length}
          onClose={() => setGenOpen(false)}
          onApply={(title, scenes) => {
            setEpisode({ ...draft, title, scenes });
            setParams({ id: draft.id, scene: "0" });
            setGenOpen(false);
            toast.success(`已套用 ${scenes.length} 幕，记得保存`);
          }}
        />
      )}
      {ttsOpen && draft && (
        <TtsPicker
          current={{
            engine: draft.engine,
            voice: draft.voice,
            speed: draft.speed,
          }}
          onClose={() => setTtsOpen(false)}
          onConfirm={(c) => void startWithTts(c)}
        />
      )}
      {check && (
        <PreflightPanel
          result={check}
          onClose={() => setCheck(null)}
          onProceed={() => {
            setCheck(null);
            void start("build", { skipPicker: true, skipCheck: true });
          }}
          onJump={(scene) => {
            setCheck(null);
            setParams({ id, scene: String(scene) });
          }}
        />
      )}
    </div>
  );
}
