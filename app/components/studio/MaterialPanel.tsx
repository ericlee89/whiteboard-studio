import { useState } from "react";
import {
  IconPhoto,
  IconVideo,
  IconCheck,
  IconUpload,
  IconTrash,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import type { Episode } from "../../../shared/studio";
import { planMaterials, type MaterialHint } from "../../lib/material-plan";

const LEVEL_LABEL: Record<string, string> = {
  top: "强烈建议",
  high: "建议",
  low: "可选",
};

function assetUrl(id: string, file: string) {
  return `/studio-asset?id=${encodeURIComponent(id)}&file=${encodeURIComponent(file)}`;
}

export function MaterialPanel({
  episode,
  busy,
  onAttach,
  onRemove,
}: {
  episode: Episode;
  busy: boolean;
  onAttach: (index: number, kind: "image" | "video", file: File) => Promise<void>;
  onRemove: (index: number) => Promise<void>;
}) {
  const [pending, setPending] = useState<number | null>(null);
  const hints = planMaterials(episode);
  const needed = hints.filter((h) => h.level !== "none");
  const done = needed.filter((h) => h.current);
  const pct = needed.length ? Math.round((done.length / needed.length) * 100) : 100;

  return (
    <div className="material-panel">
      <div className="material-hero">
        <div className="material-stat">
          <strong>{done.length}</strong>
          <span>/ {needed.length}</span>
        </div>
        <div className="material-stat-label">建议素材已就位</div>
        <div className="material-track">
          <i style={{ width: `${pct}%` }} />
        </div>
        <p className="material-tip">
          没配素材的幕会按纯文字出片，不影响成片。
        </p>
      </div>

      <ul className="material-list">
        {hints.map((h) => (
          <MaterialRow
            key={h.index}
            hint={h}
            episodeId={episode.id}
            busy={busy || pending === h.index}
            onPick={async (kind, file) => {
              setPending(h.index);
              try {
                await onAttach(h.index, kind, file);
              } finally {
                setPending(null);
              }
            }}
            onRemove={() => onRemove(h.index)}
          />
        ))}
      </ul>
    </div>
  );
}

function MaterialRow({
  hint,
  episodeId,
  busy,
  onPick,
  onRemove,
}: {
  hint: MaterialHint;
  episodeId: string;
  busy: boolean;
  onPick: (kind: "image" | "video", file: File) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const done = !!hint.current;
  const accept = hint.kind === "video" ? "video/mp4,video/quicktime,video/webm" : "image/png,image/jpeg,image/webp";

  return (
    <li
      className={[
        "material-row",
        done ? "is-done" : "",
        hint.level === "top" ? "is-top" : "",
        hint.level === "none" ? "is-plain" : "",
        hint.conflict ? "is-conflict" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="material-head">
        <span className="material-no">
          {String(hint.index + 1).padStart(2, "0")}
        </span>
        <span className="material-name">{hint.title}</span>
        {hint.level !== "none" && !done && (
          <em className={`material-tag tag-${hint.level}`}>
            {LEVEL_LABEL[hint.level]}
          </em>
        )}
        {done && (
          <em className="material-tag tag-done">
            <IconCheck size={11} stroke={3} />
            {hint.current!.type === "video" ? "视频" : "图片"}
          </em>
        )}
      </div>

      <p className="material-why">{hint.reason}</p>

      {done ? (
        <div className="material-done-row">
          {hint.current!.type === "video" ? (
            <video
              className="material-thumb"
              src={assetUrl(episodeId, hint.current!.file)}
              muted
              loop
              autoPlay
              playsInline
            />
          ) : (
            <img
              className="material-thumb"
              src={assetUrl(episodeId, hint.current!.file)}
              alt=""
            />
          )}
          <Button
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => onRemove()}
          >
            <IconTrash size={14} />
            移除
          </Button>
        </div>
      ) : hint.kind ? (
        <label className={`material-drop ${busy ? "is-busy" : ""}`}>
          <input
            type="file"
            accept={accept}
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) await onPick(hint.kind!, file);
            }}
          />
          {hint.kind === "video" ? (
            <IconVideo size={16} />
          ) : (
            <IconPhoto size={16} />
          )}
          {busy
            ? "上传中…"
            : hint.kind === "video"
              ? "上传一段视频"
              : "上传一张截图"}
          <IconUpload size={13} className="material-drop-icon" />
        </label>
      ) : (
        <p className="material-plain">这一幕不需要素材</p>
      )}
    </li>
  );
}
