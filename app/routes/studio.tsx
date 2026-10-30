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
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
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
    [tab, setTab] = useState("narration"),
    [dirty, setDirty] = useState(false),
    [newTitle, setNewTitle] = useState(""),
    [open, setOpen] = useState(false),
    [playing, setPlaying] = useState(false),
    [uploading, setUploading] = useState(false);
  const cancel = useActionMutation("cancel-render");
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
  async function start(mode: "build" | "preview") {
    try {
      await persist();
      await render.mutateAsync({ id: draft!.id, mode });
      toast.success(mode === "build" ? "出片任务已开始" : "预览任务已开始");
      await status.refetch();
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
          <span className="stage-badge">
            {draft.sample ? "示例" : "本地"} / 场景 {sceneIndex + 1}
          </span>
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
        <div className="storyboard">
          <div className="storyboard-head">
            <span>分镜台本</span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEpisode({
                  ...draft,
                  scenes: [
                    ...draft.scenes,
                    {
                      title: "新的场景",
                      narration: "在这里写下这一幕的旁白。",
                      points: ["画面要点"],
                      image: null,
                      video: null,
                    },
                  ],
                });
                setParams({ id: draft.id, scene: String(draft.scenes.length) });
              }}
            >
              <IconPlus size={14} />
              添加场景
            </Button>
          </div>
          <div className="scene-strip">
            {draft.scenes.map((s, i) => (
              <button
                key={i}
                className={
                  i === sceneIndex ? "scene-card selected" : "scene-card"
                }
                onClick={() => {
                  setPlaying(false);
                  setParams({ id: draft.id, scene: String(i) });
                }}
              >
                <div className="scene-image">
                  <Board episode={draft} index={i} small />
                  <span>{String(i + 1).padStart(2, "0")}</span>
                </div>
                <strong>{s.title}</strong>
                <small>
                  {s.narration.split("|").length} 个节拍 · {s.narration.length}{" "}
                  字
                </small>
              </button>
            ))}
          </div>
        </div>
        <div className="job-panel">
          <div>
            <IconMovie size={17} />
            <strong>{status.data?.stage || "尚未导出"}</strong>
            {status.data?.state === "running" && (
              <span>{status.data.progress}%</span>
            )}
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
          </div>
          {status.data?.state === "running" && (
            <progress value={status.data.progress} max="100" />
          )}
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
                  <a key={f.url} href={f.url} target="_blank" rel="noreferrer">
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
      </section>
      <aside className="inspector">
        <div className="inspector-tabs">
          {[
            ["narration", "旁白"],
            ["settings", "配音"],
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
        {tab === "narration" ? (
          <div className="inspector-content">
            {draft.scenes.length === 1 && (
              <Button
                variant="outline"
                onClick={() =>
                  void agent(
                    "根据主题与资料来源，生成约两分钟的完整旁白与分镜；每幕三到四个节拍，逐幕保存到 scenes；证据不足的事实保留为待核查",
                  )
                }
              >
                <IconMovie size={15} />
                生成整期分镜
              </Button>
            )}
            <div className="field-heading">
              <span>场景 {String(sceneIndex + 1).padStart(2, "0")}</span>
              <IconPencil size={14} />
            </div>
            <label htmlFor="scene-title">场景标题</label>
            <Input
              id="scene-title"
              value={active.title}
              maxLength={40}
              onChange={(e) => edit({ title: e.target.value })}
            />
            <div className="field-heading">
              <label htmlFor="narration">旁白脚本</label>
              <span>{active.narration.length} 字</span>
            </div>
            <Textarea
              id="narration"
              value={active.narration}
              onChange={(e) => edit({ narration: e.target.value })}
              className="narration-input"
            />
            <p className="field-hint">用 | 分隔节拍，让画面跟随讲解。</p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() =>
                agent("润色当前场景旁白，并在聊天里说明改动供我审阅")
              }
            >
              <IconPencil size={15} />
              润色这一幕
            </Button>
            <label htmlFor="points">画面要点</label>
            <Textarea
              id="points"
              value={active.points.join("\n")}
              onChange={(e) =>
                edit({ points: e.target.value.split("\n").slice(0, 6) })
              }
              rows={5}
            />
            <p className="field-hint">每行一个要点，最多 6 条。</p>
            <label htmlFor="scene-image">画面配图</label>
            {active.image ? (
              <div className="scene-image">
                <img
                  className="scene-image-thumb"
                  src={`/studio-asset?id=${encodeURIComponent(draft.id)}&file=${encodeURIComponent(active.image.file)}`}
                  alt="配图预览"
                />
                <div className="scene-image-controls">
                  <select
                    id="scene-image"
                    value={active.image.fit}
                    onChange={(e) =>
                      edit({
                        image: {
                          ...active.image!,
                          fit: e.target.value as "side" | "full",
                        },
                      })
                    }
                  >
                    <option value="side">右侧 · 与要点并排</option>
                    <option value="full">整屏 · 独占画面</option>
                  </select>
                  <Button
                    variant="ghost"
                    disabled={uploading}
                    onClick={async () => {
                      try {
                        await fetch(
                          `/studio-asset?id=${encodeURIComponent(draft.id)}&file=${encodeURIComponent(active.image!.file)}`,
                          { method: "DELETE", credentials: "same-origin" },
                        );
                      } catch {
                        // 文件删不掉不影响从剧集里摘除引用
                      }
                      edit({ image: null });
                    }}
                  >
                    移除
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <input
                  id="scene-image"
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={uploading || !draft.id}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !draft) return;
                    setUploading(true);
                    try {
                      const res = await fetch(
                        `/studio-asset?id=${encodeURIComponent(draft.id)}`,
                        {
                          method: "POST",
                          credentials: "same-origin",
                          headers: {
                            "Content-Type":
                              file.type || "application/octet-stream",
                          },
                          body: await file.arrayBuffer(),
                        },
                      );
                      if (!res.ok) throw new Error(`上传失败（${res.status}）`);
                      const { file: name } = await res.json();
                      edit({ image: { file: name, fit: "side" }, video: null });
                    } catch (err) {
                      report(err);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                <p className="field-hint">
                  {uploading
                    ? "上传中…"
                    : "PNG / JPG / WebP，自动转 PNG 并缩到画布宽度。先保存项目再出片。"}
                </p>
              </>
            )}
            <label htmlFor="scene-video">画面视频</label>
            {active.video ? (
              <div className="scene-image">
                <video
                  className="scene-image-thumb"
                  src={`/studio-asset?id=${encodeURIComponent(draft.id)}&file=${encodeURIComponent(active.video.file)}`}
                  muted
                  loop
                  autoPlay
                  playsInline
                />
                <div className="scene-image-controls">
                  <select
                    id="scene-video"
                    value={active.video.fit}
                    onChange={(e) =>
                      edit({
                        video: {
                          ...active.video!,
                          fit: e.target.value as "side" | "full",
                        },
                      })
                    }
                  >
                    <option value="side">右侧 · 与要点并排</option>
                    <option value="full">整屏 · 独占画面</option>
                  </select>
                  <Button
                    variant="ghost"
                    disabled={uploading}
                    onClick={async () => {
                      try {
                        await fetch(
                          `/studio-asset?id=${encodeURIComponent(draft.id)}&file=${encodeURIComponent(active.video!.file)}`,
                          { method: "DELETE", credentials: "same-origin" },
                        );
                      } catch {
                        // 文件删不掉不影响从剧集里摘除引用
                      }
                      edit({ video: null });
                    }}
                  >
                    移除
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <input
                  id="scene-video"
                  type="file"
                  accept="video/mp4,video/quicktime,video/webm"
                  disabled={uploading || !draft.id}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file || !draft) return;
                    setUploading(true);
                    try {
                      const res = await fetch(
                        `/studio-video?id=${encodeURIComponent(draft.id)}`,
                        {
                          method: "POST",
                          credentials: "same-origin",
                          headers: {
                            "Content-Type":
                              file.type || "application/octet-stream",
                          },
                          body: await file.arrayBuffer(),
                        },
                      );
                      if (!res.ok) throw new Error(`上传失败（${res.status}）`);
                      const { file: name } = await res.json();
                      edit({ video: { file: name, fit: "side" }, image: null });
                    } catch (err) {
                      report(err);
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                <p className="field-hint">
                  {uploading
                    ? "上传并转码中…"
                    : "mp4 / mov / webm，最长 60 秒，自动转成无声 MP4。会替换本幕配图。"}
                </p>
              </>
            )}
            <label htmlFor="sources">资料来源</label>
            <Textarea
              id="sources"
              value={draft.sources}
              onChange={(e) =>
                setEpisode({ ...draft, sources: e.target.value })
              }
              rows={4}
              placeholder="来源链接、支持的观点、核对日期"
            />
            <Button
              variant="ghost"
              onClick={() =>
                agent("核查资料来源与叙述口径，缺少证据的地方标为待核查")
              }
            >
              <IconCheck size={15} />
              检查内容
            </Button>
          </div>
        ) : tab === "settings" ? (
          <div className="inspector-content">
            <label htmlFor="style">画面风格</label>
            <select
              id="style"
              value={draft.style ?? "kai"}
              onChange={(e) =>
                setEpisode({ ...draft, style: e.target.value as Episode["style"] })
              }
            >
              <option value="kai">楷体 · 暖米黄点阵</option>
              <option value="classic">手写体 · 米白点阵</option>
              <option value="training">苹方江南 · 纯白投屏</option>
              <option value="culture">苹方相思 · 暖米黄</option>
              <option value="office">苹方江南 · 冷浅灰</option>
            </select>
            <label htmlFor="engine">配音引擎</label>
            <select
              id="engine"
              value={draft.engine}
              onChange={(e) => {
                const engine = e.target.value as Episode["engine"];
                setEpisode({
                  ...draft,
                  engine,
                  voice:
                    engine === "mi"
                      ? "冰糖"
                      : engine === "edge"
                        ? "zh-CN-YunxiNeural"
                        : "zh_male_liufei_uranus_bigtts",
                });
              }}
            >
              <option value="edge">Edge TTS · 无需密钥</option>
              <option value="mi">小米 MiMo</option>
              <option value="volc">火山引擎</option>
            </select>
            <label htmlFor="voice">音色</label>
            <Input
              id="voice"
              value={draft.voice}
              onChange={(e) => setEpisode({ ...draft, voice: e.target.value })}
            />
            <label htmlFor="speed">语速 · {draft.speed.toFixed(1)}×</label>
            <input
              id="speed"
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={draft.speed}
              onChange={(e) =>
                setEpisode({ ...draft, speed: Number(e.target.value) })
              }
            />
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
            <div className="connection-note">
              <IconVolume size={20} />
              <p>Edge TTS 需要联网。小米与火山凭证从服务端环境变量读取。</p>
              <p>AI 润色与生成请在右侧助手中连接模型。</p>
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
    </div>
  );
}
