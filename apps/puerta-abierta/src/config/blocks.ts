// Bloques editoriales — Puerta Abierta
// ---------------------------------------------------------------------------
// Catálogo interno de bloques que la portada puede renderizar. Cada bloque
// declara su origen (GUIA_WEB / DOSSIER / MANUAL) y su estado editorial.
//
// Reglas aplicadas (migración editorial, ver
// `01_PRODUCTO/CONTENIDO_Y_TRAZABILIDAD.md`):
//
//   - "Consignar mi local comercial ahora" → CTA "Hablar sobre mi local"
//     con ancla `#contacto`. El CTA se modela en el bloque `hero`.
//   - "Formulario de Captación Nacional" → retirado; se sustituye por el
//     bloque `contacto`, que conduce al correo aprobado.
//   - "Solicitar Análisis Estadístico y Comercial de Mi Local" → retirado;
//     no se renderiza ningún envío ni formulario.
//   - Bloques cuyo texto proviene de las fuentes históricas (ventajas,
//     metodología, comparativa, cobertura) se mantienen como fixture con
//     `enabled: false` y `status: BORRADOR`. Un build `commercial` exige
//     `APROBADO` para los habilitados (regla cruzada en validate-config).
//   - El footer se reduce a una versión mínima sin la frase del dossier
//     sobre "formulario oficial de recepción de activos".

import type { EditorialBlock } from "../contracts/index.js";

export const EDITORIAL_BLOCKS: EditorialBlock[] = [
  // 1. Hero — texto visible aprobado por el propietario el 2026-09-24.
  {
    id: "hero-portada",
    tipo: "hero",
    enabled: true,
    status: "APROBADO",
    origen: {
      fuente: "GUIA_WEB",
      refOriginal: "Sección 1 — Sección Principal (Hero Section)",
    },
    data: {
      titulo: "Puerta Abierta",
      subtitulo:
        "Base técnica de la unidad PA-03. El contenido comercial definitivo se publica tras revisión.",
      // CTA migrado: ya NO dice "Consignar mi local comercial ahora".
      cta: {
        label: "Hablar sobre mi local",
        href: "#contacto",
        ancla: "#contacto",
      },
    },
  },

  // 2. Ventajas — sección 2 de GUIA_WEB, transcrita como fixture.
  {
    id: "ventajas-portada",
    tipo: "ventajas",
    enabled: false,
    status: "BORRADOR",
    origen: {
      fuente: "GUIA_WEB",
      refOriginal: "Sección 2 — Ventajas Competitivas y Alcance",
    },
    data: {
      titulo: "Ventajas declaradas (en revisión)",
      items: [
        { titulo: "Presencia y alcance nacional", cuerpo: "Texto fuente pendiente de revisión." },
        { titulo: "Sin requisitos mínimos", cuerpo: "Texto fuente pendiente de revisión." },
        { titulo: "Enfoque proactivo de expansión", cuerpo: "Texto fuente pendiente de revisión." },
      ],
    },
  },

  // 3. Metodología — secciones 3 de GUIA_WEB / DOSSIER.
  {
    id: "metodologia-portada",
    tipo: "metodologia",
    enabled: false,
    status: "BORRADOR",
    origen: {
      fuente: "DOSSIER",
      refOriginal: "Página 3 — Metodología de Expansión y Geomarketing",
    },
    data: {
      titulo: "Metodología (en revisión)",
      cuerpo: "Resumen declarativo; los términos absolutos requieren revisión.",
    },
  },

  // 4. Comparativa — sección 4 de GUIA_WEB.
  {
    id: "comparativa-portada",
    tipo: "comparativa",
    enabled: false,
    status: "BORRADOR",
    origen: {
      fuente: "GUIA_WEB",
      refOriginal: "Sección 4 — Tabla Comparativa de Mercado",
    },
    data: {
      titulo: "Comparativa declarada (en revisión)",
      cuerpo: "Texto en BORRADOR; las afirmaciones requieren validación.",
    },
  },

  // 5. Cobertura — sección 5 de GUIA_WEB / DOSSIER.
  {
    id: "cobertura-portada",
    tipo: "cobertura",
    enabled: false,
    status: "BORRADOR",
    origen: {
      fuente: "GUIA_WEB",
      refOriginal: "Sección 5 — Presencia Regional y Cobertura Nacional",
    },
    data: {
      titulo: "Presencia regional declarada",
      subtitulo: "Trece ciudades distribuidas en cuatro zonas, según transcripción.",
    },
  },

  // 6. Contacto — sustituye a "Sección 6 — Formulario de Captación".
  {
    id: "contacto-portada",
    tipo: "contacto",
    enabled: true,
    status: "APROBADO",
    origen: {
      fuente: "MANUAL",
      refOriginal: "Migración editorial — sustituto de Sección 6",
    },
    data: {
      titulo: "Contacto",
      subtitulo:
        "Los canales se muestran únicamente cuando están habilitados y aprobados por el operador.",
      cta: {
        label: "Hablar sobre mi local",
        href: "#contacto",
        ancla: "#contacto",
      },
    },
  },

  // 7. Footer — sustituye a "Sección 7 — Pie de Página de Confianza Legal".
  // La frase "formulario oficial de recepción de activos" del dossier
  // original NO se incluye aquí (ver CONTENIDO_Y_TRAZABILIDAD.md).
  {
    id: "footer-portada",
    tipo: "footer",
    enabled: true,
    status: "APROBADO",
    origen: {
      fuente: "MANUAL",
      refOriginal: "Migración editorial — sustituto de Sección 7",
    },
    data: {
      cuerpo:
        "Puerta Abierta — base técnica de PA-03. Razón social y NIT se confirman en tarea posterior.",
    },
  },
];
