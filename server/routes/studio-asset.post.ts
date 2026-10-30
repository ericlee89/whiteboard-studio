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
 * 场景配图上传。
 *
 * 引擎的贴纸接口只认 PNG —— 它靠读 PNG 文件头的宽高字段排版，JPEG 会读出垃圾值。
 * 所以这里一律用 ffmpeg 转一遍，顺带把超宽图缩到画布尺度，避免 4K 截图拖慢逐帧渲染。
 */
const MAX_BYTES = 12 * 1024 * 1024;
const MAX_WIDTH = 1600;

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const id = String(q.id || "");
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw createError({ statusCode: 400 });

  const session = await getSession(event);
  if (!session?.email) throw createError({ statusCode: 401 });

  const raw = await readRawBody(event, false);
  if (!raw || !raw.length) throw createError({ statusCode: 400 });
  if (raw.length > MAX_BYTES)
    throw createError({ statusCode: 413, statusMessage: "图片超过 12MB" });

  const dir = path.resolve(
    "data/episodes",
    ownerKey(session.email),
    `${id}.assets`,
  );
  fs.mkdirSync(dir, { recursive: true });

  const stamp = Date.now().toString(36);
  const name = `img-${stamp}.png`;
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
        "-frames:v",
        "1",
        "-vf",
        `scale='min(${MAX_WIDTH},iw)':-2`,
        out,
      ],
      { stdio: "pipe" },
    );
  } catch {
    fs.rmSync(tmp, { force: true });
    fs.rmSync(out, { force: true });
    throw createError({ statusCode: 400, statusMessage: "无法识别的图片格式" });
  }
  fs.rmSync(tmp, { force: true });

  const info = fs.statSync(out);
  return { file: name, bytes: info.size };
});
