#!/usr/bin/env node
// contrast.mjs — Puerta Abierta (PA-04)
// ---------------------------------------------------------------------------
// CLI de medición de contraste WCAG 2.x sobre los pares de la paleta
// urbana declarada en `apps/puerta-abierta/src/styles/tokens.css`.
//
// Objetivo: que PA-Q013 quede con un registro reproducible (procedimiento
// guardado, ver PRUEBAS_Y_ACEPTACION.md).
//
// Implementación: funciones puras; no lee ficheros; no hace red; no usa
// dependencias externas. Sólo Node stdlib.
//
// Salida: por cada par probado, ratio numérico + veredicto WCAG
// (AA-Normal, AA-Large, AAA-Normal, AAA-Large, FAIL). Exit 0 si todo
// veredictos requeridos pasan; exit 1 si algún par FAIL en el umbral
// configurado.
//
// Uso:
//   node scripts/contrast.mjs
//   node scripts/contrast.mjs --strict   (exige AA-normal en todos los pares)
//
// Por defecto, los pares exigidos son AA-normal (texto ≥ 18pt o 14pt bold)
// porque la mayoría del contenido web es texto pequeño.

import { argv, exit, stdout } from "node:process";

// ---------------------------------------------------------------------------
// Paleta y pares a medir — sincronizada con tokens.css
// ---------------------------------------------------------------------------

const PALETTE = {
  "color-ink": "#0D2C54",
  "color-action": "#1D4ED8",
  "color-text": "#1A1A1A",
  "color-muted": "#4B5563",
  "color-background": "#FFFFFF",
  "color-surface": "#F4F6F9",
  "color-lavender": "#F0E9F5",
  "hero-veil": "#0D1421", // aproximación del rgba(13,20,33,0.62) ya compuesto
  "hero-veil-composed": "#1F2A3F", // fondo urbano + velo, contraste hero
  white: "#FFFFFF",
  black: "#000000",
};

// Pares a medir: nombre, foreground, background, criterio mínimo
//   - "AA":  4.5  (texto normal)
//   - "AA-L": 3.0 (texto grande ≥18pt o 14pt bold)
//   - "AAA": 7.0
//   - "AAA-L": 4.5
const PARES = [
  // Texto del cuerpo sobre fondos principales
  { nombre: "Texto sobre blanco", fg: "color-text", bg: "color-background", criterio: "AA" },
  { nombre: "Texto sobre surface", fg: "color-text", bg: "color-surface", criterio: "AA" },
  { nombre: "Texto muted sobre blanco", fg: "color-muted", bg: "color-background", criterio: "AA" },
  { nombre: "Texto muted sobre surface", fg: "color-muted", bg: "color-surface", criterio: "AA" },
  { nombre: "Ink sobre blanco", fg: "color-ink", bg: "color-background", criterio: "AA" },
  { nombre: "Ink sobre surface", fg: "color-ink", bg: "color-surface", criterio: "AA" },
  { nombre: "Ink sobre lavanda", fg: "color-ink", bg: "color-lavender", criterio: "AA" },

  // CTA — texto blanco sobre action (uso real en .btn--primary)
  { nombre: "Blanco sobre action", fg: "white", bg: "color-action", criterio: "AA" },
  // Par DECORATIVO: el gradient mark del header/footer combina ambos
  // azules sin texto encima (28x28 px). Se documenta aquí para que
  // conste en el registro, pero NO cuenta como fallo de texto real.
  {
    nombre: "[DECORATIVO] Ink sobre action",
    fg: "color-ink",
    bg: "color-action",
    criterio: "AA-L",
    decorativo: true,
  },

  // Hero (texto blanco sobre velo)
  { nombre: "Hero: blanco sobre velo", fg: "white", bg: "hero-veil-composed", criterio: "AA" },
  { nombre: "Hero: eyebrow sobre velo", fg: "white", bg: "hero-veil-composed", criterio: "AA-L" },

  // Comparativa
  {
    nombre: "Comparativa: ink sobre lavanda (celda propia)",
    fg: "color-ink",
    bg: "color-lavender",
    criterio: "AA",
  },
];

// ---------------------------------------------------------------------------
// Cálculo WCAG 2.x — luminancia relativa y ratio
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new Error(`hex inválido: ${hex}`);
  let h = m[1];
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function canalLineal(c8) {
  const cs = c8 / 255;
  return cs <= 0.03928 ? cs / 12.92 : Math.pow((cs + 0.055) / 1.055, 2.4);
}

function luminanciaRelativa(hex) {
  const { r, g, b } = hexToRgb(hex);
  const R = canalLineal(r);
  const G = canalLineal(g);
  const B = canalLineal(b);
  // Fórmula WCAG 2.x: 0.2126·R + 0.7152·G + 0.0722·B
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

function ratioContraste(hexFg, hexBg) {
  const l1 = luminanciaRelativa(hexFg);
  const l2 = luminanciaRelativa(hexBg);
  const [claro, oscuro] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (claro + 0.05) / (oscuro + 0.05);
}

const UMBRALES = {
  AA: 4.5,
  "AA-L": 3.0,
  AAA: 7.0,
  "AAA-L": 4.5,
};

// ---------------------------------------------------------------------------
// Reporter
// ---------------------------------------------------------------------------

function veredicto(ratio, criterio) {
  const u = UMBRALES[criterio];
  if (ratio >= UMBRALES["AAA"]) return "AAA";
  if (ratio >= UMBRALES["AAA-L"] && criterio.startsWith("AA")) return "AA";
  if (ratio >= u) return "OK";
  return "FAIL";
}

function fmt(n) {
  return n.toFixed(2);
}

function main() {
  const strict = argv.includes("--strict");
  const failures = [];
  const lines = [];

  lines.push("# Contraste WCAG — Puerta Abierta (PA-04)");
  lines.push("");
  lines.push(`Procedimiento: luminancia relativa WCAG 2.x · ratio = (L1+0.05)/(L2+0.05)`);
  lines.push(
    `Modo: ${strict ? "estricto (exige AA-normal en todos los pares)" : "estándar (umbral por par)"}`,
  );
  lines.push("");

  for (const p of PARES) {
    const fg = PALETTE[p.fg];
    const bg = PALETTE[p.bg];
    const r = ratioContraste(fg, bg);
    const v = veredicto(r, p.criterio);
    const umbral = UMBRALES[p.criterio];
    const ok = r >= (strict && p.criterio === "AA-L" ? UMBRALES["AA"] : umbral);
    const decorativo = p.decorativo === true;
    const marca = ok ? "✓" : decorativo ? "·" : "✗";
    const sufijo = ok ? "" : decorativo ? " (DECORATIVO — no es par texto)" : " (NO CUMPLE)";
    lines.push(
      `${marca} ${p.nombre.padEnd(48)} fg=${p.fg.padEnd(20)} bg=${p.bg.padEnd(22)} ratio=${fmt(r).padStart(6)}  criterio=${p.criterio}  → ${v}${sufijo}`,
    );
    if (!ok && !decorativo) failures.push(p.nombre);
  }

  lines.push("");
  lines.push(`Total: ${PARES.length} pares · Fallos: ${failures.length}`);
  if (failures.length) lines.push(`Pares que NO cumplen: ${failures.join("; ")}`);

  const out = lines.join("\n") + "\n";
  stdout.write(out);

  // Persistir también a docs/implementacion/PA-04/contraste.txt
  // (se hace desde el caller; este script sólo imprime).

  if (failures.length > 0) {
    exit(1);
  }
  exit(0);
}

main();
