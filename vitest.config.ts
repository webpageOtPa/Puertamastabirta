import { defineConfig } from "vitest/config";

// Vitest 5 comparte motor con Vite 8, mismo peer que Astro 7.3.3.
// Esta configuración es SOLO para pruebas de contratos y reglas
// de configuración; no toca apps/puerta-abierta/.
// La comprobación de tipos estricta se ejecuta aparte con
// `pnpm check:ts` para no duplicar trabajo ni correr tsc dos veces.
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/dist/**", "tests/e2e/**"],
    reporters: ["default"],
    pool: "threads",
  },
  resolve: {
    alias: {
      "@tests": new URL("./tests", import.meta.url).pathname,
    },
  },
});
