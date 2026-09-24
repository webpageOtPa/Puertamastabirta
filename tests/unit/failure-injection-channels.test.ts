import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateConfig } from "../../apps/puerta-abierta/src/lib/validate-config.js";

// PA-03 / PA-Q004 — Puerta de fallos sobre canales inválidos.
//
// Este test codifica la contraposición del contrato de `validateConfig`:
//
//   1) El fixture `tests/fixtures/channels-invalid.json` declara DOS
//      infracciones simultáneas frente al contrato:
//        a) Canal con `enabled && approved` pero `value === null`
//           → el validador lo rechaza por canal habilitado con value
//             vacío.
//        b) Dos canales con el mismo `id` "canal-duplicado"
//           → el validador lo rechaza por IDs duplicados.
//   2) Cuando el fixture está presente, el validador DEBE devolver
//      `{ ok: false }`. Aquí afirmamos lo contrario (PASADO espurio),
//      de modo que la expectativa sea FALSA por diseño y el test
//      falle con exit != 0 — la "puerta" detecta el fixture roto.
//   3) Cuando el fixture se retira (existsSync === false), el test se
//      SALTA con `it.skipIf(...)` para que Vitest lo reporte como
//      `skipped` (no `passed` silencioso), igual que el patrón
//      fijado en `failure-injection.test.ts`.
//
// El uso de `skipIf` mantiene el estado limpio del suite mientras no
// se esté ejecutando la demostración; tras retirar el fixture, la
// suite completa sigue verde.

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "..", "..");
const INVALID_CHANNELS_FIXTURE = resolve(REPO_ROOT, "tests/fixtures/channels-invalid.json");

interface FixtureShape {
  site: Parameters<typeof validateConfig>[0]["site"];
  channels: Parameters<typeof validateConfig>[0]["channels"];
  groups: Parameters<typeof validateConfig>[0]["groups"];
  cities: Parameters<typeof validateConfig>[0]["cities"];
  blocks: Parameters<typeof validateConfig>[0]["blocks"];
  profile: Parameters<typeof validateConfig>[0]["profile"];
}

function loadFixture(): FixtureShape {
  const raw = readFileSync(INVALID_CHANNELS_FIXTURE, "utf8");
  return JSON.parse(raw) as FixtureShape;
}

describe("failure-injection-channels — la puerta detecta canales inválidos", () => {
  it.skipIf(!existsSync(INVALID_CHANNELS_FIXTURE))(
    "con fixture presente: el validador rechaza IDs duplicados y canal habilitado sin valor",
    () => {
      const input = loadFixture();
      const result = validateConfig(input);
      // El fixture es deliberadamente inválido: IDs duplicados Y un
      // canal habilitado pero con value null. La puerta lo debe
      // rechazar. Aquí afirmamos lo contrario: si el validador cumple
      // su contrato, este test falla (exit != 0) y `pnpm test`
      // muestra el diagnóstico legible de Vitest.
      expect(result.ok).toBe(true);
    },
  );
});
