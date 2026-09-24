// Canales de contacto — Puerta Abierta
// ---------------------------------------------------------------------------
// El propietario autorizó mostrar el correo comercial y confirmó recepción
// del buzón el 2026-09-24 (PA-Q058, declaración del propietario).
// Teléfono y WhatsApp siguen deshabilitados y sin valor.
//
// El ejemplo coincide con el literal del contrato de
// `02_ARQUITECTURA/CONFIGURACION_Y_CONTRATOS.md` (sección "Ejemplo de
// configuración técnica, no publicable"). Editar este archivo sin
// actualizar el contrato se considera un cambio de fuente que debe pasar
// por revisión.

import type { ContactChannel } from "../contracts/index.js";

export const CONTACT_CHANNELS: ContactChannel[] = [
  {
    id: "email-comercial",
    kind: "email",
    value: "contacto@puertamasabierta.com.co",
    label: "Escribir un correo",
    enabled: true,
    approved: true,
  },
  {
    id: "telefono-comercial",
    kind: "phone",
    value: null,
    label: "Llamar",
    enabled: false,
    approved: false,
  },
  {
    id: "whatsapp-comercial",
    kind: "whatsapp",
    value: null,
    label: "Abrir WhatsApp",
    enabled: false,
    approved: false,
  },
];
