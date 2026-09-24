#!/usr/bin/env node
// Compila siempre el perfil comercial, con independencia del entorno del host.
import { spawnSync } from "node:child_process";

const env = { ...process.env, PA_BUILD_PROFILE: "commercial" };
const steps = [
  ["pnpm", ["run", "validate:config:commercial"]],
  [process.execPath, ["scripts/sync-coverage-script.mjs"]],
  ["pnpm", ["--filter", "./apps/puerta-abierta", "build"]],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, {
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
