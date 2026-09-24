import { defineConfig, devices } from "@playwright/test";

// Playwright E2E — Puerta Abierta
// Fuente de la verdad: el sitio compilado en apps/puerta-abierta/dist
// (no astro dev). El servidor estático es local y efímero.

const PORT = Number(process.env["PA_E2E_PORT"] ?? "4173");
const HOST = process.env["PA_E2E_HOST"] ?? "127.0.0.1";

export default defineConfig({
  testDir: "./tests/e2e",
  // Sólo *.spec.ts para no confundir con unit tests.
  testMatch: /.*\.spec\.ts$/,
  // Limitar a 1 worker para que el servidor estático compartido no
  // sufra contención ni se abran varios puertos.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    headless: true,
    trace: "off",
    screenshot: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `node scripts/serve-dist.mjs --host ${HOST} --port ${PORT}`,
    url: `http://${HOST}:${PORT}/`,
    reuseExistingServer: !process.env["CI"],
    stdout: "ignore",
    stderr: "pipe",
    timeout: 30_000,
  },
});
