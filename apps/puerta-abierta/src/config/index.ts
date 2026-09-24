// Agregador de configuración — Puerta Abierta
// ---------------------------------------------------------------------------
// Compone la identidad, canales, cobertura y bloques en un único objeto
// `SiteConfig`. Cada parte se valida contra su esquema Zod antes de
// publicarse, y luego `validateConfig` aplica las reglas cruzadas.
//
// Uso típico en build:
//   import { loadSiteConfig } from "../config";
//   const cfg = loadSiteConfig("technical");
//   if (!cfg.ok) { ... mostrar cfg.errors ... }
//
// Esta función NUNCA lanza. Si un esquema Zod falla, lo traduce a un
// `ValidationConfigErr` con mensajes por campo.

import {
  ContactChannelSchema,
  CoverageCitySchema,
  CoverageGroupSchema,
  EditorialBlockSchema,
  SiteFeaturesSchema,
  SiteIdentitySchema,
} from "../contracts/index.ts";
import type {
  BuildProfile,
  ContactChannel,
  CoverageCity,
  CoverageGroup,
  EditorialBlock,
  SiteFeatures,
  SiteIdentity,
} from "../contracts/index.ts";
import { CONTACT_CHANNELS } from "./channels.ts";
import { COVERAGE_CITIES, COVERAGE_GROUPS } from "./coverage.ts";
import { EDITORIAL_BLOCKS } from "./blocks.ts";
import { SITE_FEATURES } from "./features.ts";
import { SITE_IDENTITY } from "./site.ts";
import { validateConfig, type ValidateConfigResult } from "../lib/validate-config.ts";

export interface SiteConfig {
  site: SiteIdentity;
  channels: ContactChannel[];
  groups: CoverageGroup[];
  cities: CoverageCity[];
  blocks: EditorialBlock[];
  features: SiteFeatures;
  profile: BuildProfile;
}

export interface LoadedSiteConfigOk {
  ok: true;
  config: SiteConfig;
  /** Resultado detallado de `validateConfig` (forma cruzada). */
  crossValidation: Extract<ValidateConfigResult, { ok: true }>;
}

export interface LoadedSiteConfigErr {
  ok: false;
  errors: string[];
}

export type LoadedSiteConfig = LoadedSiteConfigOk | LoadedSiteConfigErr;

function fromZod<T>(
  schema: {
    safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: unknown };
  },
  raw: unknown,
  label: string,
  errors: string[],
): T | undefined {
  const r = schema.safeParse(raw);
  if (r.success) return r.data;
  const err = r.error as { issues?: Array<{ path: (string | number)[]; message: string }> };
  const issues = err.issues ?? [];
  for (const i of issues) {
    errors.push(`[${label}] ${i.path.join(".") || "(root)"}: ${i.message}`);
  }
  return undefined;
}

/**
 * Carga y valida la configuración completa. Si los esquemas Zod fallan,
 * los errores se acumulan y la función devuelve `{ ok: false, errors }`.
 * Si los esquemas pasan, ejecuta `validateConfig` (reglas cruzadas).
 */
export function loadSiteConfig(profile: BuildProfile): LoadedSiteConfig {
  const errors: string[] = [];

  const site = fromZod(SiteIdentitySchema, SITE_IDENTITY, "site", errors);
  const channelsRaw = CONTACT_CHANNELS;
  const channels: ContactChannel[] = [];
  for (let i = 0; i < channelsRaw.length; i++) {
    const ch = fromZod(ContactChannelSchema, channelsRaw[i], `channels[${i}]`, errors);
    if (ch) channels.push(ch);
  }

  const groups: CoverageGroup[] = [];
  for (let i = 0; i < COVERAGE_GROUPS.length; i++) {
    const g = fromZod(CoverageGroupSchema, COVERAGE_GROUPS[i], `groups[${i}]`, errors);
    if (g) groups.push(g);
  }

  const cities: CoverageCity[] = [];
  for (let i = 0; i < COVERAGE_CITIES.length; i++) {
    const c = fromZod(CoverageCitySchema, COVERAGE_CITIES[i], `cities[${i}]`, errors);
    if (c) cities.push(c);
  }

  const blocks: EditorialBlock[] = [];
  for (let i = 0; i < EDITORIAL_BLOCKS.length; i++) {
    const b = fromZod(EditorialBlockSchema, EDITORIAL_BLOCKS[i], `blocks[${i}]`, errors);
    if (b) blocks.push(b);
  }

  const features = fromZod(SiteFeaturesSchema, SITE_FEATURES, "features", errors);

  if (!site) {
    return { ok: false, errors };
  }
  if (errors.length > 0 || !features) {
    return { ok: false, errors };
  }

  const cross = validateConfig({ site, channels, groups, cities, blocks, features, profile });
  if (!cross.ok) {
    return { ok: false, errors: cross.errors };
  }

  return {
    ok: true,
    crossValidation: cross,
    config: { site, channels, groups, cities, blocks, features, profile },
  };
}
