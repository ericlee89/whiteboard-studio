import { createHash } from "node:crypto";
import {
  listLocalArtifactFiles,
  readLocalArtifactFile,
  writeLocalArtifactFile,
} from "@agent-native/core/local-artifacts";
import { episodeSchema, sampleEpisode, type Episode } from "../shared/studio";
export const options = { appId: "whiteboard-studio" };
export function ownerKey(email: string | undefined) {
  if (!email) throw new Error("需要有效的登录身份");
  return createHash("sha256").update(email).digest("hex").slice(0, 24);
}
export const episodePath = (owner: string, id: string) =>
  `data/episodes/${owner}/${id}.json`;
export async function loadEpisode(owner: string, id: string) {
  const f = await readLocalArtifactFile({
    ...options,
    path: episodePath(owner, id),
  });
  return f
    ? { episode: episodeSchema.parse(JSON.parse(f.content)), hash: f.hash }
    : null;
}
export async function saveEpisode(
  owner: string,
  episode: Episode,
  hash?: string | null,
) {
  return writeLocalArtifactFile({
    ...options,
    path: episodePath(owner, episode.id),
    content: JSON.stringify(episode, null, 2),
    ...(hash ? { expectedHash: hash } : { ifNotExists: true }),
  });
}
export async function episodes(owner: string) {
  const files = await listLocalArtifactFiles(options);
  const mine = files
    .filter(
      (f) =>
        f.path.startsWith(`data/episodes/${owner}/`) &&
        f.path.endsWith(".json"),
    )
    .slice(0, 100);
  if (!mine.length) {
    try {
      await saveEpisode(owner, sampleEpisode());
    } catch {}
    return [await loadEpisode(owner, "sample-whiteboard")];
  }
  return Promise.all(
    mine.map((f) =>
      readLocalArtifactFile({ ...options, path: f.path }).then((v) =>
        v
          ? {
              episode: episodeSchema.parse(JSON.parse(v.content)),
              hash: v.hash,
            }
          : null,
      ),
    ),
  );
}
