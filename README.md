# Puerta Abierta

Código fuente estático preparado para Cloudflare Pages. El sitio publicado se genera con `pnpm run build:pages` y queda en `apps/puerta-abierta/dist`.

Para conectar este código al repositorio GitHub y a Cloudflare Pages, consulta [deploy/CLOUDFLARE_PAGES.md](deploy/CLOUDFLARE_PAGES.md). Este paquete no incluye expedientes locales, capturas ni el HTML autocontenido usado como adjunto de correo.

El artefacto web se compila desde el código. Las pruebas locales se ejecutan con `pnpm run verify` tras instalar dependencias con `pnpm install --frozen-lockfile`.
