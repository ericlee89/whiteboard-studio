import {
  defineEventHandler,
  getQuery,
  getHeader,
  setResponseStatus,
  setHeader,
  sendStream,
  createError,
} from "h3";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { getSession } from "@agent-native/core/server";
import { Readable } from "node:stream";
import { ownerKey } from "../studio-store";
export default defineEventHandler(async (event) => {
  const q = getQuery(event),
    id = String(q.id || ""),
    job = String(q.job || ""),
    // Accept links emitted by older Windows versions before validating paths.
    file = String(q.file || "").replace(/\\/g, "/");
  if (
    !/^[a-z0-9-]{1,80}$/.test(id) ||
    !/^[a-f0-9-]{36}$/.test(job) ||
    !file.startsWith("engine/") ||
    file.includes("..") ||
    !/\.(png|mp4|srt|md)$/.test(file)
  )
    throw createError({ statusCode: 400 });
  const session = await getSession(event);
  if (!session?.email) throw createError({ statusCode: 401 });
  const target = path.resolve(
    "data/jobs",
    ownerKey(session.email),
    id,
    job,
    file,
  );
  const info = await stat(target).catch(() => null);
  if (!info?.isFile()) throw createError({ statusCode: 404 });
  const mime = target.endsWith(".png")
    ? "image/png"
    : target.endsWith(".mp4")
      ? "video/mp4"
      : "text/plain; charset=utf-8";
  setHeader(event, "Content-Type", mime);
  setHeader(event, "Content-Length", String(info.size));
  setHeader(event, "Cache-Control", "private, no-store");
  setHeader(event, "Accept-Ranges", "bytes");
  const range = getHeader(event, "range");
  let start = 0, end = info.size - 1;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match && (match[1] || match[2])) {
      if (match[1]) {
        start = Number(match[1]);
        end = match[2] ? Math.min(Number(match[2]), end) : end;
      } else start = Math.max(0, info.size - Number(match[2]));
    }
    if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) || start > end || start >= info.size ||
        (!match[1] && Number(match[2]) === 0)) {
      setResponseStatus(event, 416);
      setHeader(event, "Content-Range", `bytes */${info.size}`);
      setHeader(event, "Content-Length", "0");
      return null;
    }
    setResponseStatus(event, 206);
    setHeader(event, "Content-Range", `bytes ${start}-${end}/${info.size}`);
    setHeader(event, "Content-Length", String(end - start + 1));
  }
  if (event.req.method === "HEAD") return null;
  return sendStream(
    event,
    Readable.toWeb(createReadStream(target, range ? { start, end } : {})) as ReadableStream,
  );
});
