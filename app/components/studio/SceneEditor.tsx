import { useState } from "react";
import { IconX, IconPhoto, IconVideo, IconUpload, IconPencil } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Episode } from "../../../shared/studio";
import { LAYOUT_OPTIONS } from "../../lib/studio-options";

type Scene = Episode["scenes"][number];

function assetUrl(id: string, file: string) {
  return `/studio-asset?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}`;
}

/**
 * 单幕编辑抽屉。
 *
 * 工作台默认只呈现结果，逐幕改文案是低频操作，所以收进右下角的铅笔里。
 * 不挡画布——改的时候还能看着右边那幅图。
 */
export function SceneEditor({
  episode,
  index,
  onPatch,
  onEpisodePatch,
  onUpload,
  onRemoveAsset,
  onClose,
}: {
  episode: Episode;
  index: number;
  onPatch: (patch: Partial<Scene>) => void;
  onEpisodePatch: (patch: Partial<Episode>) => void;
  onUpload: (kind: "image" | "video", file: File) => Promise<void>;
  onRemoveAsset: () => Promise<void>;
  onClose: () => void;
}) {
  const scene = episode.scenes[index];
  const [busy, setBusy] = useState(false);
  if (!scene) return null;

  const beats = scene.narration.split("|").length;
  const media = scene.video || scene.image;

  const pick = async (kind: "image" | "video", file: File) => {
    setBusy(true);
    try {
      await onUpload(kind, file);
    } finally {
      setBusy(false);
    }
  };

  return (
    <aside className="scene-drawer" aria-label="单幕编辑">
      <header className="drawer-head">
        <span className="drawer-no">
          <IconPencil size={13} />
          第 {String(index + 1).padStart(2, "0")} 幕
        </span>
        <button className="drawer-close" onClick={onClose} aria-label="关闭">
          <IconX size={16} />
        </button>
      </header>

      <div className="drawer-body">
        <label htmlFor="ed-title">标题</label>
        <Input
          id="ed-title"
          value={scene.title}
          maxLength={40}
          onChange={(e) => onPatch({ title: e.target.value })}
        />

        <div className="field-heading">
          <label htmlFor="ed-narration">旁白</label>
          <span>
            {scene.narration.length} 字 · {beats} 拍
          </span>
        </div>
        <Textarea
          id="ed-narration"
          className="narration-input"
          value={scene.narration}
          onChange={(e) => onPatch({ narration: e.target.value })}
        />
        <p className="field-hint">
          用半角竖线 | 切节拍，一拍只讲一件事。竖线越多，画面层次越细。
        </p>

        <label htmlFor="ed-points">画面要点</label>
        <Textarea
          id="ed-points"
          rows={4}
          value={scene.points.join("\n")}
          onChange={(e) =>
            onPatch({ points: e.target.value.split("\n").slice(0, 6) })
          }
        />
        <p className="field-hint">
          每行一条，最多 6 条。清单版式一行约 30 字，左右对比约 15 字。
        </p>

        <label htmlFor="ed-layout">版式</label>
        <select
          id="ed-layout"
          value={scene.layout ?? "list"}
          onChange={(e) => onPatch({ layout: e.target.value as Scene["layout"] })}
        >
          {LAYOUT_OPTIONS.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name} · {l.note}
            </option>
          ))}
        </select>

        <label>配图 / 配视频</label>
        {media ? (
          <div className="asset-box">
            {scene.video ? (
              <video
                className="asset-thumb"
                src={assetUrl(episode.id, scene.video.file)}
                muted
                loop
                autoPlay
                playsInline
              />
            ) : (
              <img
                className="asset-thumb"
                src={assetUrl(episode.id, scene.image!.file)}
                alt=""
              />
            )}
            <div className="asset-controls">
              <select
                value={media.fit}
                onChange={(e) =>
                  onPatch(
                    scene.video
                      ? {
                          video: {
                            ...scene.video,
                            fit: e.target.value as "side" | "full",
                          },
                        }
                      : {
                          image: {
                            ...scene.image!,
                            fit: e.target.value as "side" | "full",
                          },
                        },
                  )
                }
              >
                <option value="side">右侧 · 与要点并排</option>
                <option value="full">整屏 · 独占画面</option>
              </select>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => void onRemoveAsset()}
              >
                移除
              </Button>
            </div>
          </div>
        ) : (
          <div className="drawer-assets">
            <label className="material-drop">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) await pick("image", f);
                }}
              />
              <IconPhoto size={15} />
              截图
              <IconUpload size={12} className="material-drop-icon" />
            </label>
            <label className="material-drop">
              <input
                type="file"
                accept="video/mp4,video/quicktime,video/webm"
                disabled={busy}
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) await pick("video", f);
                }}
              />
              <IconVideo size={15} />
              视频
              <IconUpload size={12} className="material-drop-icon" />
            </label>
          </div>
        )}
        <p className="field-hint">
          配了素材，这一幕的版式会自动回到清单，右侧留给素材。
        </p>

        <label htmlFor="ed-sources">资料来源</label>
        <Textarea
          id="ed-sources"
          rows={3}
          value={episode.sources}
          onChange={(e) => onEpisodePatch({ sources: e.target.value })}
          placeholder="来源链接、核对日期"
        />
      </div>
    </aside>
  );
}
