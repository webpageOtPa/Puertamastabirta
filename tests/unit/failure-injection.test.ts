import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateStaticConfig } from "./static-config-schema";
import { readAstroConfig } from "./astro-config-parser";

// PA-02 — Demostración de "puerta de fallos".
//
// El flujo pedido por la ficha es:
//   1) Introducir un fixture inválido en tests/fixtures/.
//   2) Ejecutar pnpm test y capturar el FALLO (exit != 0) —
//      la puerta detecta el fixture roto y aborta.
//   3) Retirar el fixture; pnpm test vuelve a pasar.
//
// Para materializar este flujo, este test afirma la CONTRAPOSICIÓN
// del contrato: cuando el fixture está presente, espera que
// validateStaticConfig lo ACEPTE (expect(result.ok).toBe(true)).
// Esa expectativa es FALSA por diseño (el validador rechaza el
// fixture), por lo que el test falla con exit != 0 y el operador
// ve el diagnóstico legible de Vitest.
//
// Cuando el fixture se retira (existsSync === false), el test se
// SALTA con `it.skipIf(!existsSync(...))` para que Vitest lo
// reporte como `skipped` (no como `passed` silencioso). El
// directorio tests/fixtures/ queda vacío al cerrar la demostración
// y el resumen de la suite muestra "1 skipped" de forma visible.
//
// Este test es la "puerta" misma: afirmar el paso deja ver el
// fallo; omitir el fixture deja ver el verde (con skipped explícito).

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const INVALID_FIXTURE_PATH = resolve(REPO_ROOT, "tests/fixtures/astro.config.invalid.mjs");

describe("failure-injection — la puerta detecta el fixture inválido", () => {
  it.skipIf(!existsSync(INVALID_FIXTURE_PATH))(
    "con fixture presente: el validador lo rechaza (debe fallar)",
    async () => {
      const cfg = await readAstroConfig(INVALID_FIXTURE_PATH);
      const result = validateStaticConfig(cfg);
      // El fixture es deliberadamente inválido: output "server",
      // adapter presente, build.format "entry". La puerta lo debe
      // rechazar. Aquí afirmamos lo contrario a propósito: si el
      // validador cumple su contrato, este test falla (exit != 0)
      // y pnpm test muestra el diagnóstico legible.
      expect(result.ok).toBe(true);
    },
  );
});
