import {
  defineEventHandler,
  getQuery,
  readRawBody,
  createError,
} from "h3";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getSession } from "@agent-native/core/server";
import { ownerKey } from "../studio-store";

/**
 * 场景配视频上传。
 *
 * 统一转成 H.264 / yuv420p / 无音轨：
 *  - 叠加阶段只取视频流，原声会和旁白打架，所以直接丢掉
 *  - 浏览器上传的 webm / hevc 不一定能被 ffmpeg overlay 直接吃，统一转一遍最省心
 *  - 限 60 秒，避免有人传了整段录屏把渲染拖死
 */
const MAX_BYTES = 60 * 1024 * 1024;
const MAX_SECONDS = 60;
const MAX_WIDTH = 1920;

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const id = String(q.id || "");
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw createError({ statusCode: 400 });

  const session = await getSession(event);
  if (!session?.email) throw createError({ statusCode: 401 });

  const raw = await readRawBody(event, false);
  if (!raw || !raw.length) throw createError({ statusCode: 400 });
  if (raw.length > MAX_BYTES)
    throw createError({ statusCode: 413, statusMessage: "视频超过 60MB" });

  const dir = path.resolve(
    "data/episodes",
    ownerKey(session.email),
    `${id}.assets`,
  );
  fs.mkdirSync(dir, { recursive: true });

  const stamp = Date.now().toString(36);
  const name = `vid-${stamp}.mp4`;
  const tmp = path.join(dir, `.tmp-${stamp}`);
  const out = path.join(dir, name);

  fs.writeFileSync(tmp, raw);
  try {
    execFileSync(
      "ffmpeg",
      [
        "-y",
        "-loglevel",
        "error",
        "-i",
        tmp,
        "-t",
        String(MAX_SECONDS),
        "-an",
        "-vf",
        `scale='min(${MAX_WIDTH},iw)':-2`,
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "23",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        out,
      ],
      { stdio: "pipe", timeout: 180000 },
    );
  } catch {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(out, { force: true });
    throw createError({ statusCode: 400, statusMessage: "无法识别的视频格式" });
  }
  fs.rmSync(tmp, { force: true });

  const info = fs.statSync(out);
  return { file: name, bytes: info.size };
});
