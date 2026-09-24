// Contenido editorial separado de la presentación.
// Oferta confirmada por el propietario: locales comerciales en arriendo
// y orientación a empresas nacionales en expansión. Para propietarios:
// posibles alianzas y opción de compra en operaciones llave en mano,
// sujeta a las condiciones del inmueble y al acuerdo entre las partes.
export const HOME_CONTENT = {
  seo: {
    title: "Locales comerciales en arriendo para empresas nacionales en expansión",
    description:
      "Puerta Abierta ofrece locales comerciales en arriendo para empresas nacionales en expansión. Propietarios: conversemos sobre una posible alianza alrededor de tu local.",
  },
  hero: {
    eyebrow: "Puerta Abierta · Locales comerciales en arriendo",
    titulo: "Locales comerciales en arriendo",
    subtitulo:
      "Ofrecemos locales comerciales en arriendo para empresas a nivel nacional. Si eres propietario, conversemos sobre una posible alianza alrededor de tu local.",
    ctaPrimario: { label: "Consultar un arriendo", href: "#contacto" },
    ctaSecundario: { label: "Explorar una alianza", href: "#metodo" },
  },
  ventajas: {
    titulo: "Locales comerciales y conversaciones que abren posibilidades",
    items: [
      {
        titulo: "Para empresas en expansión",
        cuerpo:
          "Consulta por locales comerciales en arriendo para tu próximo punto de operación. La disponibilidad se confirma para cada inmueble.",
        icono: "grid" as const,
      },
      {
        titulo: "Para propietarios",
        cuerpo:
          "Si tienes un local comercial, exploremos una alianza. En operaciones llave en mano, también se contempla una posible compra del local, sujeta a las condiciones del inmueble y al acuerdo entre las partes.",
        icono: "scale" as const,
      },
      {
        titulo: "Nuestro propósito",
        cuerpo:
          "La idea es construir una empresa con bienes productivos y alianzas estratégicas con empresas nacionales en expansión.",
        icono: "compass" as const,
      },
    ],
  },
  metodo: {
    titulo: "Hablemos de tu próximo espacio o de una posible alianza",
    intro:
      "Empresas y propietarios tienen necesidades distintas. La conversación empieza por conocerlas y concretar qué tendría sentido para cada parte.",
    pasos: [
      {
        numero: 1,
        titulo: "Cuéntanos qué buscas",
        cuerpo:
          "Si representas una empresa, cuéntanos dónde quieres expandirte y qué tipo de local buscas. Si eres propietario, conversemos sobre tu interés en una posible alianza.",
      },
      {
        numero: 2,
        titulo: "Conversemos sobre el local",
        cuerpo:
          "Para un arriendo, consulta la ubicación y las características del inmueble. Como propietario, comparte el contexto de tu local y si te interesa explorar una alianza o una posible venta en una operación llave en mano.",
      },
      {
        numero: 3,
        titulo: "Aclaremos las condiciones",
        cuerpo:
          "La disponibilidad y las condiciones de arriendo se confirman por inmueble. Una alianza o una posible compra en una operación llave en mano están sujetas a las condiciones del local y al acuerdo entre las partes.",
      },
      {
        numero: 4,
        titulo: "Definamos el siguiente paso",
        cuerpo:
          "Si existe interés en continuar, conversemos directamente sobre los siguientes pasos de la operación y las condiciones que deben acordarse.",
      },
    ],
  },
  cobertura: {
    titulo: "Ciudades de referencia",
    intro:
      "Las ciudades se muestran como referencia, con posiciones aproximadas en el mapa. Esta lista no anuncia disponibilidad de locales.",
  },
  contacto: {
    titulo: "Conversemos sobre un arriendo o una posible alianza",
    intro: {
      technical:
        "Para consultar un arriendo o explorar una alianza, escríbenos por correo. Te responderemos desde ese mismo canal.",
      commercial:
        "Para consultar un arriendo o explorar una alianza, escríbenos por correo. En operaciones llave en mano, también podemos conversar sobre una posible compra del local, sujeta a las condiciones del inmueble y al acuerdo entre las partes.",
    },
  },
};

// Ilustración comercial con el logo superior izquierdo actualizado por PA-17L.
export const METODO_ILUSTRACION = {
  src: "/images/espacios-comerciales.png",
  srcset:
    "/images/espacios-640.webp 640w, /images/espacios-960.webp 960w, /images/espacios-1280.webp 1280w",
  sizes: "(max-width: 768px) 100vw, 1216px",
  alt: "Ilustración conceptual en perspectiva de un edificio con locales comerciales y accesos peatonales. Incluye los rótulos: 50–300 m², alto potencial y flujo constante de personas.",
  caption:
    "Ilustración conceptual generada con IA. No representa un inmueble disponible ni un plano técnico validado.",
  width: 1280,
  height: 720,
  ampliaHref: "/images/espacios-comerciales.png",
  ampliaLabel: "Ver ilustración ampliada",
};
