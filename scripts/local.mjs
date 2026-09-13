import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("..", import.meta.url));
const environment = { ...process.env, CI: "1", WRANGLER_LOG_PATH: ".wrangler/wrangler.log" };
function run(script, args) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], { cwd: root, env: environment, stdio: "inherit" });
  if (result.error) { console.error(result.error.message); process.exit(1); }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run("../node_modules/wrangler/bin/wrangler.js", ["d1", "migrations", "apply", "site-creator-d1", "--local", "--config", "wrangler.local.jsonc"]);
if (process.argv[2] === "dev") run("../node_modules/vite/bin/vite.js", process.argv.slice(3));
