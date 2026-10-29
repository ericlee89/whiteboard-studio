const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
function initialize(root) {
  const file = path.join(root, ".env.docker");
  let body = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : fs.readFileSync(path.join(root, ".env.docker.example"), "utf8");
  for (const key of ["POSTGRES_PASSWORD", "BETTER_AUTH_SECRET", "SECRETS_ENCRYPTION_KEY", "A2A_SECRET", "STUDIO_GATEWAY_SECRET"]) {
    const pattern = new RegExp(`^${key}=(.*)$`, "m");
    const existing = body.match(pattern);
    const value = existing?.[1].trim();
    if (value && value !== "''" && value !== '""') continue;
    const line = key + "=" + crypto.randomBytes(32).toString("hex");
    body = existing ? body.replace(pattern, line) : body.trimEnd() + "\n" + line + "\n";
  }
  fs.writeFileSync(file, body, { mode: 0o600 });
  return file;
}
if (require.main === module) {
  initialize(process.cwd());
  console.log(".env.docker is ready. Existing keys were preserved; generated secrets are not printed.");
  console.log("For MiMo speech, edit MI_TTS_API_KEY in this file before choosing the MiMo engine.");
}
module.exports = { initialize };
