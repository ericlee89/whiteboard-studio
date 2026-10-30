import {
  defineEventHandler,
  getQuery,
  createError,
} from "h3";
import fs from "node:fs";
import path from "node:path";
import { getSession } from "@agent-native/core/server";
import { ownerKey } from "../studio-store";

export default defineEventHandler(async (event) => {
  const q = getQuery(event);
  const id = String(q.id || "");
  const file = String(q.file || "");
  if (
    !/^[a-z0-9-]{1,80}$/.test(id) ||
    !/^(img-[a-z0-9]+\.png|vid-[a-z0-9]+\.mp4)$/.test(file)
  )
    throw createError({ statusCode: 400 });

  const session = await getSession(event);
  if (!session?.email) throw createError({ statusCode: 401 });

  const target = path.resolve(
    "data/episodes",
    ownerKey(session.email),
    `${id}.assets`,
    file,
  );
  fs.rmSync(target, { force: true });
  return { removed: true };
});
