import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { H3, getRequestURL } from "h3";
import middleware from "../../server/middleware/00-studio-gateway";
const secret = "fixture-deployment-secret-" + "x".repeat(40);
const app = new H3().use(middleware).use(middleware).get("/inspect", (event) => ({
  origin: getRequestURL(event).origin,
  host: event.req.headers.get("host"),
  gatewayProofPresent: Boolean(event.req.headers.get("x-studio-gateway-key")),
}));
beforeEach(() => {
  vi.stubEnv("STUDIO_DEPLOYMENT_MODE", "vercel-backend");
  vi.stubEnv("APP_URL", "https://studio.example.com");
  vi.stubEnv("STUDIO_GATEWAY_SECRET", secret);
  vi.stubEnv("AUTH_DISABLED", "0");
  vi.stubEnv("LOCAL_SINGLE_USER", "0");
});
afterEach(() => vi.unstubAllEnvs());
test("direct or forged gateway requests cannot reach the backend", async () => {
  expect((await app.request("http://backend.example/inspect")).status).toBe(403);
  expect((await app.request("http://backend.example/inspect", {headers:{"x-studio-gateway-key":"forged","x-forwarded-host":"studio.example.com"}})).status).toBe(403);
});
test("verified gateway establishes the public HTTPS origin and remains valid on repeated dispatch", async () => {
  const r = await app.request("http://backend.example/inspect", {headers:{"x-studio-gateway-key":secret}});
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({origin:"https://studio.example.com",host:"studio.example.com",gatewayProofPresent:true});
});
test("standalone VPS keeps the normal authentication path without a gateway requirement", async () => {
  vi.stubEnv("STUDIO_DEPLOYMENT_MODE", "vps");
  expect((await app.request("https://studio.example.com/inspect")).status).toBe(200);
});
test("provider liveness probe is public and contains no deployment or user data", async () => {
  const r = await app.request("http://backend.example/studio-health");
  expect(r.status).toBe(200);
  expect(await r.json()).toEqual({status:"ok"});
  expect((await app.request("http://backend.example/inspect")).status).toBe(403);
  expect((await app.request("http://backend.example/studio-health",{method:"POST"})).status).toBe(403);
});
