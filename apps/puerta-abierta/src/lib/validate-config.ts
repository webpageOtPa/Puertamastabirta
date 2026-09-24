// Validación de configuración pública — Puerta Abierta
// ---------------------------------------------------------------------------
// Esta capa aplica las REGLAS CRUZADAS que los esquemas Zod individuales
// no pueden capturar (los esquemas garantizan forma; las reglas garantizan
// coherencia del conjunto). Se ejecuta antes de cualquier build:
//
//   - IDs únicos entre canales y entre bloques.
//   - Canal deshabilitado con valor no nulo → rechazo.
//   - Canal `enabled` sin `approved` → rechazo.
//   - Ciudad con `groupId` desconocido o ciudad declarada en un grupo
//     pero no en `COVERAGE_CITIES` → rechazo.
//   - IDs de ciudad duplicados → rechazo.
//   - Grupos duplicados o con lista vacía → rechazo.
//   - En build `commercial`, todo bloque `enabled` debe tener
//     `status === "APROBADO"` → rechazo.
//   - En build `commercial`, `site.canonical` debe ser una URL `https://...`
//     no nula → rechazo.
//   - En build `commercial`, `site.primaryChannelId` debe estar configurado
//     y apuntar a un canal habilitado, aprobado y con valor no vacío → rechazo.
//     Esta regla sustituye al antiguo "al menos un canal utilizable": un
//     primaryChannelId válido implica un canal utilizable, y exigir ambos
//     sería redundante.
//
// Salida: un objeto `{ ok: true, summary }` o
// `{ ok: false, errors: string[] }`. Los mensajes son legibles y se
// imprimen uno por línea para que `pnpm validate:config` los muestre tal
// cual en CI.

import type {
  BuildProfile,
  ContactChannel,
  CoverageCity,
  CoverageGroup,
  EditorialBlock,
  SiteFeatures,
  SiteIdentity,
} from "../contracts/index.js";

export interface ValidateConfigInput {
  site: SiteIdentity;
  channels: ContactChannel[];
  groups: CoverageGroup[];
  cities: CoverageCity[];
  blocks: EditorialBlock[];
  /**
   * Features opcionales (PA-08). Opcional para no romper llamadas
   * existentes de tests; `loadSiteConfig` siempre lo aporta tras
   * validarlo contra `SiteFeaturesSchema`.
   */
  features?: SiteFeatures;
  profile: BuildProfile;
}

export interface ValidateConfigOk {
  ok: true;
  summary: {
    siteId: string;
    profile: BuildProfile;
    channelCount: number;
    enabledApprovedChannels: number;
    groupCount: number;
    cityCount: number;
    blockCount: number;
    enabledBlocks: number;
    /**
     * Estado del flag `coverageInteraction` (PA-08). `null` cuando la
     * llamada no aportó `features` (tests sintéticos anteriores).
     */
    coverageInteraction: boolean | null;
  };
}

export interface ValidateConfigErr {
  ok: false;
  errors: string[];
}

export type ValidateConfigResult = ValidateConfigOk | ValidateConfigErr;

// Helpers de dominio para validaciones de canal.
const FORBIDDEN_EMAIL_CHARS = ["\r", "\n", "?", "#", "&", "<", ">"];
const VALID_PHONE_PREFIX = /^\+[1-9]\d{6,14}$/;
const VALID_WA_DIGITS = /^\d{8,15}$/;

function checkUniqueIds(items: { id: string }[], kind: string, errors: string[]): void {
  const seen = new Map<string, number>();
  for (const it of items) {
    seen.set(it.id, (seen.get(it.id) ?? 0) + 1);
  }
  for (const [id, count] of seen) {
    if (count > 1) {
      errors.push(`[${kind}] ID duplicado: "${id}" aparece ${count} veces.`);
    }
  }
}

function checkChannelsUnique(channels: ContactChannel[], errors: string[]): void {
  checkUniqueIds(channels, "canal", errors);
}

function checkChannelShape(ch: ContactChannel, errors: string[]): void {
  if (ch.enabled && !ch.approved) {
    errors.push(
      `[canal:${ch.id}] habilitado pero no aprobado: un canal habilitado debe estar aprobado por el operador.`,
    );
  }
  if (!ch.enabled && ch.value !== null) {
    errors.push(
      `[canal:${ch.id}] deshabilitado con valor no vacío: "${ch.value}". Un canal deshabilitado debe tener value === null.`,
    );
  }
  if (ch.enabled && ch.approved && (ch.value === null || ch.value === "")) {
    errors.push(
      `[canal:${ch.id}] habilitado y aprobado pero con value vacío: el valor no puede ser null ni cadena vacía.`,
    );
  }
  // Validación adicional de la forma del valor para canales activos.
  if (ch.enabled && ch.approved && ch.value) {
    if (ch.kind === "email") {
      const lower = ch.value.toLowerCase();
      for (const c of FORBIDDEN_EMAIL_CHARS) {
        if (lower.includes(c)) {
          errors.push(
            `[canal:${ch.id}] email contiene carácter prohibido "${c}": riesgo de inyección de cabeceras.`,
          );
          break;
        }
      }
      // Rechazar protocolos/URLs arbitrarios y listas/Cc/Bcc: el valor
      // almacenado es SOLO el buzón (el `mailto:` se genera al renderizar,
      // no se almacena). Se rechazan `:` y `/` (protocolo/URL), `,`
      // y `;` (listas o parámetros Cc/Bcc).
      if (/[:/,;]/.test(ch.value)) {
        errors.push(
          `[canal:${ch.id}] email contiene protocolo, URL o lista no permitida (solo un buzón simple): "${ch.value}".`,
        );
      }
      if (/^\s*mailto:/i.test(ch.value) || /^\s*https?:/i.test(ch.value)) {
        errors.push(
          `[canal:${ch.id}] email no debe incluir protocolo o URL, solo el buzón: "${ch.value}".`,
        );
      }
      // D1 (PA-09 · revisión): rechazar secuencias percent-encoded de
      // caracteres de control (%0a, %0d, %09, ...). El `%` aislado sigue
      // siendo válido en el local-part; solo se rechaza `%0x` de control.
      if (/%0[0-9a-dA-D]/i.test(ch.value)) {
        errors.push(
          `[canal:${ch.id}] email contiene secuencia percent-encoded de carácter de control (inyección): "${ch.value}".`,
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lower)) {
        errors.push(`[canal:${ch.id}] email no tiene forma válida: "${ch.value}".`);
      }
    } else if (ch.kind === "phone") {
      if (!VALID_PHONE_PREFIX.test(ch.value)) {
        errors.push(
          `[canal:${ch.id}] teléfono no está en formato internacional E.164: "${ch.value}".`,
        );
      }
    } else if (ch.kind === "whatsapp") {
      if (!VALID_WA_DIGITS.test(ch.value)) {
        errors.push(
          `[canal:${ch.id}] whatsapp debe contener sólo dígitos internacionales (8–15): "${ch.value}".`,
        );
      }
    }
  }
}

function checkCoverageShape(
  groups: CoverageGroup[],
  cities: CoverageCity[],
  errors: string[],
): void {
  // IDs únicos en grupos y ciudades.
  checkUniqueIds(groups, "cobertura:grupo", errors);
  checkUniqueIds(cities, "cobertura:ciudad", errors);

  // Grupos no vacíos.
  for (const g of groups) {
    if (g.cities.length === 0) {
      errors.push(`[cobertura:grupo:${g.id}] no contiene ciudades.`);
    }
    // Detectar ciudad repetida dentro de la lista de un grupo.
    const seenInGroup = new Map<string, number>();
    for (const cid of g.cities) {
      seenInGroup.set(cid, (seenInGroup.get(cid) ?? 0) + 1);
    }
    for (const [cid, count] of seenInGroup) {
      if (count > 1) {
        errors.push(
          `[cobertura:ciudad] ID duplicado: "${cid}" aparece ${count} veces en la lista del grupo "${g.id}".`,
        );
      }
    }
  }

  // Ciudades referenciadas por grupo existen en COVERAGE_CITIES.
  const cityIds = new Set(cities.map((c) => c.id));
  for (const g of groups) {
    for (const cid of g.cities) {
      if (!cityIds.has(cid)) {
        errors.push(`[cobertura:grupo:${g.id}] referencia ciudad desconocida: "${cid}".`);
      }
    }
  }

  // Toda ciudad pertenece exactamente a un grupo.
  for (const c of cities) {
    const referencedBy = groups.filter((g) => g.cities.includes(c.id));
    if (referencedBy.length === 0) {
      errors.push(`[cobertura:ciudad:${c.id}] (${c.name}) no aparece en ningún grupo.`);
    } else if (referencedBy.length > 1) {
      errors.push(
        `[cobertura:ciudad:${c.id}] aparece en ${referencedBy.length} grupos (debe ser 1).`,
      );
    }
    const ownGroup = groups.find((g) => g.id === c.groupId);
    if (!ownGroup) {
      errors.push(`[cobertura:ciudad:${c.id}] apunta a groupId inexistente: "${c.groupId}".`);
    } else if (!ownGroup.cities.includes(c.id)) {
      errors.push(
        `[cobertura:ciudad:${c.id}] su groupId="${c.groupId}" no la incluye en su lista.`,
      );
    }
  }
}

function checkBlocksShape(blocks: EditorialBlock[], errors: string[]): void {
  checkUniqueIds(blocks, "bloque", errors);
}

function checkProfileRules(input: ValidateConfigInput, errors: string[]): void {
  if (input.profile === "commercial") {
    for (const b of input.blocks) {
      if (b.enabled && b.status !== "APROBADO") {
        errors.push(
          `[bloque:${b.id}] habilitado en build commercial pero su estado es "${b.status}" (debe ser APROBADO).`,
        );
      }
    }
    // Regla 1: canonical debe ser una URL https://... no nula.
    if (input.site.canonical === null) {
      errors.push("[build:commercial] canonical debe ser una URL https://... aprobada");
    } else if (!/^https:\/\/[^\s]+$/i.test(input.site.canonical)) {
      errors.push(
        `[build:commercial] canonical debe ser una URL https://... aprobada (recibido: "${input.site.canonical}").`,
      );
    }
    // Regla 2: primaryChannelId debe estar configurado y apuntar a un canal
    // habilitado, aprobado y con valor no vacío. Esta regla sustituye a la
    // antigua "al menos un canal utilizable" (que era un superconjunto laxo):
    // un primaryChannelId válido implica un canal utilizable, por lo que
    // exigir ambos sería redundante y produciría dos rechazos correlacionados.
    const pid = input.site.primaryChannelId;
    if (pid === null || pid === "") {
      errors.push(
        "[build:commercial] primaryChannelId no configurado o no apunta a un canal habilitado y aprobado",
      );
    } else {
      const target = input.channels.find((c) => c.id === pid);
      const ok =
        target !== undefined &&
        target.enabled === true &&
        target.approved === true &&
        target.value !== null &&
        target.value !== "";
      if (!ok) {
        errors.push(
          `[build:commercial] primaryChannelId no configurado o no apunta a un canal habilitado y aprobado (id="${pid}").`,
        );
      }
    }
  }
  // technical: nota explícita de preview; sin restricción dura.
}

/**
 * Valida la configuración completa. Devuelve un resultado discriminado.
 * Esta función NO lanza excepciones: las recoge en `errors`.
 */
export function validateConfig(input: ValidateConfigInput): ValidateConfigResult {
  const errors: string[] = [];

  // 1. Forma individual (cada Zod ya se aplicó al cargar los datos en
  // sus `as const`; aquí defendemos por si alguien construye el input a
  // mano desde tests).
  checkChannelsUnique(input.channels, errors);
  for (const ch of input.channels) {
    checkChannelShape(ch, errors);
  }
  checkCoverageShape(input.groups, input.cities, errors);
  checkBlocksShape(input.blocks, errors);

  // 2. Reglas por perfil.
  checkProfileRules(input, errors);

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    summary: {
      siteId: input.site.siteId,
      profile: input.profile,
      channelCount: input.channels.length,
      enabledApprovedChannels: input.channels.filter((c) => c.enabled && c.approved).length,
      groupCount: input.groups.length,
      cityCount: input.cities.length,
      blockCount: input.blocks.length,
      enabledBlocks: input.blocks.filter((b) => b.enabled).length,
      coverageInteraction: input.features?.coverageInteraction ?? null,
    },
  };
}

/** Helper para imprimir el resultado como texto legible (CLI). */
export function formatResult(result: ValidateConfigResult): string {
  if (result.ok) {
    const s = result.summary;
    return [
      "OK · configuración válida",
      `  siteId=${s.siteId} profile=${s.profile}`,
      `  canales=${s.channelCount} (habilitados+aprobados=${s.enabledApprovedChannels})`,
      `  cobertura=${s.cityCount} ciudades en ${s.groupCount} grupos`,
      `  bloques=${s.blockCount} (habilitados=${s.enabledBlocks})`,
      `  coverageInteraction=${s.coverageInteraction === null ? "no-declarado" : String(s.coverageInteraction)}`,
    ].join("\n");
  }
  return ["ERROR · configuración inválida", ...result.errors.map((e) => `  - ${e}`)].join("\n");
}
