// Contratos Zod — Puerta Abierta
// ---------------------------------------------------------------------------
// Fuente única de verdad para los tipos públicos del sitio. Los tipos
// TypeScript se infieren de los esquemas con `z.infer<typeof Schema>`, así
// que editar el esquema actualiza también el tipo. Esto evita divergencias
// entre validación y tipado.
//
// Cada esquema está documentado en línea y se corresponde con las filas
// descritas en `02_ARQUITECTURA/CONFIGURACION_Y_CONTRATOS.md`:
//
//   - SiteIdentity      → siteId, nombre público, lang, canonical.
//   - EditorialBlock    → id, tipo, enabled, data.
//   - ContactChannel    → id, kind, value, label, enabled, approved.
//   - CoverageGroup     → id, label, cities.
//   - CoverageCity      → id, name, groupId, marker opcional.
//   - BuildProfile      → technical | commercial.
//
// Los esquemas se mantienen puros (sin `superRefine` ni reglas cruzadas)
// para que puedan reutilizarse desde tests sin instanciar todo el árbol.
// Las reglas cruzadas (IDs únicos, canal vacío habilitado, comercial con
// borrador, etc.) viven en `src/lib/validate-config.ts`.

import { z } from "zod";

// ---------------------------------------------------------------------------
// SiteIdentity
// ---------------------------------------------------------------------------

export const SiteIdentitySchema = z.object({
  /** Identificador interno del sitio. Fijo en `puerta-abierta`. */
  siteId: z.literal("puerta-abierta"),
  /** Nombre público mostrado en portada, metadatos y SEO. */
  nombrePublico: z.string().min(1),
  /** Código BCP-47 corto (es-CO, es-ES, ...). Validado por regex. */
  lang: z.string().regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, "lang debe coincidir con BCP-47 corto"),
  /** URL canónica para builds comerciales; `null` en technical. */
  canonical: z.url().nullable(),
  /**
   * ID del canal de contacto principal. `null` en technical (no hay canal
   * aprobado). En commercial debe apuntar a un canal existente, habilitado,
   * aprobado y con valor no vacío (regla cruzada en `validate-config`).
   */
  primaryChannelId: z.string().min(1).nullable(),
});

export type SiteIdentity = z.infer<typeof SiteIdentitySchema>;

// ---------------------------------------------------------------------------
// BuildProfile
// ---------------------------------------------------------------------------

export const BuildProfileSchema = z.enum(["technical", "commercial"]);
export type BuildProfile = z.infer<typeof BuildProfileSchema>;

// ---------------------------------------------------------------------------
// ContactChannel
// ---------------------------------------------------------------------------

export const ContactChannelKindSchema = z.enum(["email", "phone", "whatsapp"]);
export type ContactChannelKind = z.infer<typeof ContactChannelKindSchema>;

export const ContactChannelSchema = z.object({
  /** Identificador estable. Único entre todos los canales. */
  id: z.string().min(1),
  /** Tipo de canal. Sólo se admiten los tres valores del enum. */
  kind: ContactChannelKindSchema,
  /**
   * Valor del canal (email, teléfono E.164 o dígitos wa.me). En canales
   * deshabilitados debe ser `null`. En canales habilitados y aprobados
   * debe estar presente y validarse adicionalmente en `validate-config`.
   */
  value: z.string().min(1).nullable(),
  /** Etiqueta humana mostrada en UI. */
  label: z.string().min(1),
  /** Habilitado en build técnico (preview) o comercial. */
  enabled: z.boolean(),
  /** Aprobado por el operador tras verificación humana del canal. */
  approved: z.boolean(),
});

export type ContactChannel = z.infer<typeof ContactChannelSchema>;

// ---------------------------------------------------------------------------
// CoverageCity + CoverageGroup
// ---------------------------------------------------------------------------

export const CoverageCitySchema = z.object({
  /** Identificador único (slug) de la ciudad. */
  id: z.string().min(1),
  /** Nombre legible (transcrito de GUIA_WEB / DOSSIER). */
  name: z.string().min(1),
  /** Referencia al grupo al que pertenece la ciudad. */
  groupId: z.string().min(1),
  /**
   * Marcador SVG opcional (x,y normalizados 0–1). Su validación detallada
   * ocurre en una tarea posterior; aquí sólo se exige el formato.
   */
  marker: z
    .object({
      x: z.number().min(0).max(1),
      y: z.number().min(0).max(1),
    })
    .optional(),
});

export type CoverageCity = z.infer<typeof CoverageCitySchema>;

export const CoverageGroupSchema = z.object({
  /** Identificador único del grupo. */
  id: z.string().min(1),
  /** Etiqueta humana del grupo (transcrita). */
  label: z.string().min(1),
  /** Lista de IDs de ciudad (referencias blandas; se cruzan con CoverageCity). */
  cities: z.array(z.string().min(1)).min(1),
});

export type CoverageGroup = z.infer<typeof CoverageGroupSchema>;

// ---------------------------------------------------------------------------
// SiteFeatures — interruptores de mejora progresiva
// ---------------------------------------------------------------------------
//
// Flags de build que deciden si un módulo opcional (script + controles
// exclusivos) se incluye en la salida. No habilitan recepción, backend,
// terceros ni captación: el esquema sólo admite los flags declarados
// aquí. `coverageInteraction` (PA-08) decide si la sección de cobertura
// publica el selector local de ciudad; con el flag deshabilitado la
// lista textual y el SVG informativo permanecen sin JS exclusivo.

export const SiteFeaturesSchema = z.object({
  /** Muestra el selector local de ciudad y su script de resaltado. */
  coverageInteraction: z.boolean(),
});

export type SiteFeatures = z.infer<typeof SiteFeaturesSchema>;

// ---------------------------------------------------------------------------
// EditorialBlock
// ---------------------------------------------------------------------------

/** Tipos de bloque editorial. Mantener el enum cerrado para evitar HTML suelto. */
export const EditorialBlockTypeSchema = z.enum([
  "hero",
  "ventajas",
  "metodologia",
  "comparativa",
  "cobertura",
  "contacto",
  "footer",
]);
export type EditorialBlockType = z.infer<typeof EditorialBlockTypeSchema>;

/** Estados editoriales posibles para un bloque. */
export const EditorialStatusSchema = z.enum([
  "BORRADOR",
  "PENDIENTE",
  "APROBADO",
  "OMITIDO_POR_DECISION",
]);
export type EditorialStatus = z.infer<typeof EditorialStatusSchema>;

/**
 * Datos libres del bloque. Limitados a primitivos serializables para que
 * se puedan renderizar en build sin riesgo de ejecutar HTML/JS arbitrario.
 * `markdown` se sanea en el consumidor; no se acepta `html` aquí.
 */
export const EditorialBlockDataSchema = z
  .object({
    titulo: z.string().optional(),
    subtitulo: z.string().optional(),
    cuerpo: z.string().optional(),
    markdown: z.string().optional(),
    items: z
      .array(
        z.object({
          titulo: z.string().optional(),
          cuerpo: z.string().optional(),
        }),
      )
      .optional(),
    cta: z
      .object({
        label: z.string(),
        href: z.string(),
        ancla: z.string().optional(),
      })
      .optional(),
  })
  .strict();

export type EditorialBlockData = z.infer<typeof EditorialBlockDataSchema>;

export const EditorialBlockSchema = z.object({
  /** Identificador único del bloque. */
  id: z.string().min(1),
  /** Tipo del bloque (uno de los admitidos por el enum). */
  tipo: EditorialBlockTypeSchema,
  /** Si está habilitado para renderizar. */
  enabled: z.boolean(),
  /** Estado editorial interno. `BORRADOR` y `PENDIENTE` no deben salir en comercial. */
  status: EditorialStatusSchema,
  /** Origen trazable: archivo fuente y bloque/sección original. */
  origen: z.object({
    fuente: z.enum(["GUIA_WEB", "DOSSIER", "MANUAL"]),
    refOriginal: z.string().min(1),
  }),
  /** Datos serializables del bloque. */
  data: EditorialBlockDataSchema,
});

export type EditorialBlock = z.infer<typeof EditorialBlockSchema>;
