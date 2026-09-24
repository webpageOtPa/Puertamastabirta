// Configuración pública — identidad del sitio Puerta Abierta
// ---------------------------------------------------------------------------
// Dominio propio indicado por el propietario el 2026-09-24. El perfil
// technical sigue siendo una vista no indexable; commercial exige además
// la cadena de verificación y aprobación del candidato. El esquema vive en
// `apps/puerta-abierta/src/contracts/index.ts`.

import type { SiteIdentity } from "../contracts/index.js";

export const SITE_IDENTITY: SiteIdentity = {
  siteId: "puerta-abierta",
  // Nombre público operativo; revisión comercial pendiente en PA-04+.
  nombrePublico: "Puerta Abierta",
  lang: "es-CO",
  canonical: "https://puertamasabierta.com.co",
  // El propietario confirmó la recepción del buzón el 2026-09-24.
  primaryChannelId: "email-comercial",
};
