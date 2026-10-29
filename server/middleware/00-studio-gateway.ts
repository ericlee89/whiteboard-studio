import { defineEventHandler, getHeader, createError } from "h3";
import config from "../../scripts/deploy/deployment-config.mjs";

export default defineEventHandler((event) => {
  // guard:allow-env-credential — Operator-owned deployment transport secret; it never authorizes a user or supplies a model credential.
  const settings = config.deployment(process.env);
  // Railway's HTTP liveness probe cannot carry the private gateway key.
  // This reveals no account, configuration, database or project information.
  if (event.url.pathname === '/studio-health' && ['GET','HEAD'].includes(event.req.method))
    return { status: 'ok' };
  const supplied = getHeader(event, "x-studio-gateway-key");
  if (settings.required || supplied) {
    if (!settings.publicUrl || !config.sameSecret(supplied, settings.secret))
      throw createError({ statusCode: 403, statusMessage: "Trusted gateway required" });
    // Only a verified deployment gateway may establish the external origin.
    // H3 URL helpers and downstream origin checks use this canonical origin.
    const target = new URL(event.url.pathname + event.url.search, settings.publicUrl);
    event.url.protocol = target.protocol;
    event.url.host = target.host;
    event.req.headers.set("host", target.host);
    event.req.headers.set("x-forwarded-host", target.host);
    event.req.headers.set("x-forwarded-proto", target.protocol.slice(0, -1));
    // Framework-internal action dispatch can pass the same request through
    // middleware again. Retain its transport proof inside the backend only;
    // the edge gateway always strips this header from responses.
  }
});
