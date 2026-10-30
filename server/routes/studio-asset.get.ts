import {
  defineEventHandler,
  getQuery,
  setHeader,
  createError,
} from "h3";
import fs from "node:fs";
import path from "node:path";
import { getSession } from "@agent-native/core/server";
import { ownerKey } from "../studio-store";

const SAFE_FILE = /^img-[a-z0-9]+\.png$/;

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const id = String(q.id || "");
  const file = String(q.file || "");
  if (!/^[a-z0-9-]{1,80}$/.test(id) || !SAFE_FILE.test(file))
    throw createError({ statusCode: 400 });

  const session = await getSession(event);
  if (!session?.email) throw createError({ statusCode: 401 });

  const target = path.resolve(
    "data/episodes",
    ownerKey(session.email),
    `${id}.assets`,
    file,
  );
  const info = await fs.promises.stat(target).catch(() => null);
  if (!info?.isFile()) throw createError({ statusCode: 404 });

  setHeader(event, "Content-Type", "image/png");
  setHeader(event, "Content-Length", String(info.size));
  setHeader(event, "Cache-Control", "private, max-age=60");
  return fs.createReadStream(target);
});
