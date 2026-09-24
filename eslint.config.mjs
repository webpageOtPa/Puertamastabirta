import js from "@eslint/js";
import tseslint from "typescript-eslint";
import astroParser from "astro-eslint-parser";
import globals from "globals";

export default [
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.astro/**",
      "**/test-results/**",
      "**/playwright-report/**",
      "**/.wrangler/**",
      "**/releases/**",
      "**/.private-references/**",
      "**/.opencode/**",
      // Fixtures negativos y servidores auxiliares de PA-11: se generan
      // en tests/.tmp/ durante la ejecución y se borran al terminar.
      "**/tests/.tmp/**",
      "pnpm-lock.yaml",
      // Cache de Vite al ejecutar vitest run; no es fuente a revisar.
      "**/.vitest-cache/**",
    ],
  },
  // Base: sólo archivos con extensiones de código (no JSON/MD/YAML).
  {
    files: ["**/*.{js,mjs,cjs,ts,tsx,jsx,mts,cts,astro}"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  // Scripts Node y mjs de raíz: process/console son globales Node válidos.
  {
    files: [
      "scripts/**/*.mjs",
      "scripts/**/*.cjs",
      "materializar-config.mjs",
      "aplicar-modelos-pa.mjs",
      "verificar-modelos-pa.mjs",
    ],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module",
    },
  },
  // Tests con Vitest: entorno Node.
  {
    files: ["tests/unit/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Playwright provee sus propios globals (test, expect) sobre Node + browser.
  {
    files: ["tests/e2e/**/*.ts"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
  },
  // Archivos de configuración Node/TS de raíz: process/console legítimos.
  {
    files: ["vitest.config.ts", "playwright.config.ts", "eslint.config.mjs", "prettier.config.mjs"],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  // Astro: el triple-slash reference en src/env.d.ts hacia
  // ../.astro/types.d.ts es el patrón canónico recomendado por
  // el CLI de Astro (`astro sync`); no es un import a modernizar.
  {
    files: ["apps/puerta-abierta/src/env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  // JS de navegador (p. ej. coverage-interaction.js): document/window
  // son su entorno real, no referencias sin definir. La fuente vive en
  // src/scripts/ y el build la sincroniza a public/ sólo con el flag
  // coverageInteraction habilitado (ver scripts/sync-coverage-script.mjs).
  {
    files: ["apps/puerta-abierta/public/**/*.js", "apps/puerta-abierta/src/scripts/**/*.js"],
    languageOptions: {
      globals: { ...globals.browser },
    },
  },
  // Archivos .astro: parser dedicado + no-undef desactivado porque
  // el entorno lo gestiona Astro.
  {
    files: ["**/*.astro"],
    languageOptions: {
      parser: astroParser,
      parserOptions: {
        parser: tseslint.parser,
        extraFileExtensions: [".astro"],
      },
    },
    rules: {
      "no-undef": "off",
    },
  },
];
