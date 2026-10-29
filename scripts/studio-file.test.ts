import { afterAll, beforeAll, expect, test, vi } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { H3 } from "h3";

// Exercise the real route and scanner with isolated identity/project fixtures.
vi.mock("@agent-native/core/server", () => ({
  getSession: async (event: { req: Request }) => {
    const email = event.req.headers.get("x-test-user");
    return email ? { email } : null;
  },
}));
vi.mock("@agent-native/core/action", () => ({ defineAction: (a: unknown) => a }));
vi.mock("../server/studio-store", async () => {
  const { createHash } = await import("node:crypto");
  return {
    ownerKey: (email: string) => createHash("sha256").update(email).digest("hex").slice(0, 24),
    loadEpisode: async () => ({ hash: "fixture" }),
  };
});
import handler from "../server/routes/studio-file.get";
import status from "../actions/render-status";
import { ownerKey } from "../server/studio-store";

const id = "windows-download-regression";
const job = "9545f247-4153-4618-b446-69d37efb1e01";
const email = "download-fixture@local.test";
const originalCwd = process.cwd();
let root: string;
const app = new H3().get("/studio-file", handler);
const files = [
  ["engine/build/episode/outputs/final.mp4", "video/mp4", "video-fixture"],
  ["engine/build/episode/outputs/封面-4x3.png", "image/png", "cover-fixture"],
  ["engine/build/episode/outputs/字幕.srt", "text/plain", "字幕测试"],
] as const;

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "studio-download-"));
  process.chdir(root);
  const base = path.resolve("data/jobs", ownerKey(email), id);
  for (const [file, , content] of files) {
    const target = path.join(base, job, file);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content);
  }
  await writeFile(path.join(base, "latest.json"), JSON.stringify({ job }));
  await writeFile(path.join(base, job, "status.json"), JSON.stringify({ state: "done" }));
});
afterAll(async () => {
  process.chdir(originalCwd);
  if (root) await rm(root, { recursive: true, force: true });
});

function request(file: string, user: string | null = email, range?: string) {
  const query = new URLSearchParams({ id, job, file });
  return app.request(`http://localhost/studio-file?${query}`, {
    headers: { ...(user ? { "x-test-user": user } : {}), ...(range ? { range } : {}) },
  });
}

test("the previous Windows join produces the rejected engine backslash prefix", () => {
  const legacy = path.win32.join("engine/build", "episode", "final.mp4");
  expect(legacy.startsWith("engine/")).toBe(false);
});
test.each(files)("streams current and legacy Windows links: %s", async (file, mime, content) => {
  for (const link of [file, path.win32.normalize(file)]) {
    const response = await request(link);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(mime);
    expect(await response.text()).toBe(content);
  }
});
test("scanner emits forward-slash URLs whose downloads succeed", async () => {
  const result = await status.run({ id }, { userEmail: email } as never);
  expect(result.files).toHaveLength(files.length);
  for (const file of result.files) {
    const url = new URL(file.url, "http://localhost");
    expect(url.searchParams.get("file")).toMatch(/^engine\//);
    expect(url.searchParams.get("file")).not.toContain("\\");
    expect((await app.request(url, { headers: { "x-test-user": email } })).status).toBe(200);
  }
});
test.each([
  "engine/../secret.mp4",
  "engine\\..\\secret.mp4",
  "engine/build/..\\..\\secret.mp4",
  "C:\\outside\\secret.mp4",
  "/engine/build/final.mp4",
  "engine/build/secret.env",
])("rejects traversal and invalid paths: %s", async (file) => {
  expect((await request(file)).status).toBe(400);
});
test("requires a session and isolates each owner's files", async () => {
  expect((await request(files[0][0], null)).status).toBe(401);
  expect((await request(files[0][0], "another-owner@local.test")).status).toBe(404);
  expect((await request("engine/build/missing.mp4")).status).toBe(404);
});
test("media byte ranges return only the requested bytes for browser seeking", async () => {
  const r = await request(files[0][0], email, "bytes=2-5");
  expect(r.status).toBe(206);
  expect(r.headers.get("content-range")).toBe("bytes 2-5/13");
  expect(r.headers.get("content-length")).toBe("4");
  expect(await r.text()).toBe("deo-");
  const tail = await request(files[0][0], email, "bytes=-7");
  expect(tail.status).toBe(206);
  expect(await tail.text()).toBe("fixture");
});
test.each(["bytes=999-", "bytes=5-2", "bytes=0-1,3-4", "bytes=-0", "bytes=-", "other=0-1"])("rejects unsatisfiable/invalid ranges: %s", async (range) => {
  const r = await request(files[0][0], email, range);
  expect(r.status).toBe(416);
  expect(r.headers.get("content-range")).toBe("bytes */13");
  expect(await r.text()).toBe("");
});
