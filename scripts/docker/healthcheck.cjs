async function check() {
  // The framework explicitly supports auth=0 probes for deployments whose
  // declared purpose is a localhost single-user workbench. Database/secret
  // readiness is still checked, and this does not authorize any app action.
  const local = process.env.LOCAL_SINGLE_USER === "1" && ["1", "true"].includes(process.env.AUTH_DISABLED); // guard:allow-env-credential — Container startup probe reads deployment mode flags, not provider or user credentials.
  // guard:allow-env-credential — Operator-owned gateway transport secret for this container's authenticated readiness probe only.
  const gatewayKey = process.env.STUDIO_DEPLOYMENT_MODE === 'vercel-backend' ? process.env.STUDIO_GATEWAY_SECRET : undefined;
  const response = await fetch("http://127.0.0.1:4317/_agent-native/ping?configuration=1" + (local ? "&auth=0" : ""), { signal: AbortSignal.timeout(5000), headers: gatewayKey ? { 'x-studio-gateway-key': gatewayKey } : {} });
  if (!response.ok) throw new Error("HTTP health probe failed.");
  const body = await response.json();
  if (!body.configuration || body.configuration.status === "error") throw new Error("Deployment configuration is not ready.");
  const postgres = require("postgres");
  const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 3, idle_timeout: 1, prepare: false });
  try { await sql`SELECT 1`; } finally { await sql.end({ timeout: 1 }); }
}
check().catch(() => { console.error("Whiteboard Studio or its database is not ready."); process.exitCode = 1; });
