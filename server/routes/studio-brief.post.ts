import {
  defineEventHandler,
  getQuery,
  readRawBody,
  createError,
} from "h3";
import fs from "node:fs";
import path from "node:path";
import { getSession } from "@agent-native/core/server";
import { ownerKey } from "../studio-store";
import { extractBriefText, SUPPORTED_BRIEF } from "../brief-extract";

/**
 * 生成分镜用的参考资料上传。
 *
 * 收到的文档当场解析成纯文本落盘，生成时只读那份 txt ——
 * 模型不需要认识 docx，也不用把二进制塞进请求体。
 */
const MAX_BYTES = 20 * 1024 * 1024;

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const id = String(q.id || "");
  const filename = String(q.filename || "brief.txt");
  if (!/^[a-z0-9-]{1,80}$/.test(id)) throw createError({ statusCode: 400 });

  const session = await getSession(event);
  if (!session?.email) throw createError({ statusCode: 401 });

  const raw = await readRawBody(event, false);
  if (!raw || !raw.length) throw createError({ statusCode: 400 });
  if (raw.length > MAX_BYTES)
    throw createError({ statusCode: 413, statusMessage: "文件超过 20MB" });

  let text: string;
  try {
    text = await extractBriefText(Buffer.from(raw), filename);
  } catch (e) {
    throw createError({
      statusCode: 400,
      statusMessage: e instanceof Error ? e.message : "文件解析失败",
    });
  }

  if (!text.trim()) {
    throw createError({
      statusCode: 400,
      statusMessage: `这份文件里没读到文字，可以上传 ${SUPPORTED_BRIEF}`,
    });
  }

  const dir = path.resolve(
    "data/episodes",
    ownerKey(session.email),
    `${id}.assets`,
  );
  fs.mkdirSync(dir, { recursive: true });

  // 一期只留一份资料，重传即替换
  for (const f of fs.readdirSync(dir)) {
    if (f.startsWith("brief-")) fs.rmSync(path.join(dir, f), { force: true });
  }

  const name = `brief-${Date.now().toString(36)}.txt`;
  fs.writeFileSync(path.join(dir, name), text, "utf8");

  return {
    file: name,
    chars: text.length,
    pages: text.split("\n\n").length,
    preview: text.slice(0, 160),
    name: filename,
  };
});
