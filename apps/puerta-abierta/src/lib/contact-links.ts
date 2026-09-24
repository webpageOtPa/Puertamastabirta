// Enlaces de contacto directo — Puerta Abierta (PA-09)
// ---------------------------------------------------------------------------
// Funciones puras para generar `mailto:`, `tel:` y `wa.me` desde canales
// validados. No hacen red, no piden permisos, no preabren clientes.
//
//   - Email: `mailto:<destinatario>?subject=<asunto codificado>`.
//     El asunto es una constante genérica ("Consulta sobre un local
//     comercial"); nunca se concatena crudo ni se añade body con datos
//     del visitante, ni Cc/Bcc.
//   - Teléfono: `tel:<valor E.164>` tal cual (ya normalizado en config).
//   - WhatsApp: `https://wa.me/<dígitos>` sin texto pre-rellenado.
//
// Estas funciones NO validan: la validación vive en
// `src/lib/validate-config.ts`. Aquí sólo componen el href cuando el
// canal está `enabled && approved && value !== null`.

import type { ContactChannel } from "../contracts/index.js";

/** Asunto genérico fijo para el enlace `mailto:`. Sin datos del visitante. */
export const CONTACT_EMAIL_SUBJECT = "Consulta sobre un local comercial";

/** `mailto:<email>?subject=<asunto codificado>` (asunto con encodeURIComponent). */
export function buildMailtoHref(email: string): string {
  return `mailto:${email}?subject=${encodeURIComponent(CONTACT_EMAIL_SUBJECT)}`;
}

/** `tel:<valor>` (valor E.164 ya normalizado en configuración). */
export function buildTelHref(phone: string): string {
  return `tel:${phone}`;
}

/** `https://wa.me/<dígitos>` sin texto pre-rellenado. */
export function buildWhatsAppHref(digits: string): string {
  return `https://wa.me/${digits}`;
}

/**
 * Href del canal o `null` cuando no es utilizable (deshabilitado, no
 * aprobado o sin valor). Un canal deshabilitado nunca genera un enlace
 * invisible: la UI muestra "sin enlace visible" en ese caso.
 */
export function channelHref(ch: ContactChannel): string | null {
  if (!ch.enabled || !ch.approved || !ch.value) return null;
  if (ch.kind === "email") return buildMailtoHref(ch.value);
  if (ch.kind === "phone") return buildTelHref(ch.value);
  return buildWhatsAppHref(ch.value);
}
