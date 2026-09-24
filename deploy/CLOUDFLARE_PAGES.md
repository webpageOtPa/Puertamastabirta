# Puerta Abierta en Cloudflare Pages

Destino solicitado: repositorio `webpageOtPa/Puertamastabirta` conectado a **Cloudflare Pages** mediante GitHub. Este proyecto genera HTML estático; no necesita adaptador Astro, Pages Functions, Worker, base de datos ni formulario receptor.

## Configuración del proyecto Pages

| Campo                              | Valor                                                 |
| ---------------------------------- | ----------------------------------------------------- |
| Repositorio                        | `https://github.com/webpageOtPa/Puertamastabirta.git` |
| Rama de producción                 | `main`                                                |
| Directorio raíz                    | raíz del repositorio (`/`)                            |
| Comando de build                   | `pnpm run build:pages`                                |
| Directorio de salida               | `apps/puerta-abierta/dist`                            |
| Variables de entorno de producción | `PA_BUILD_PROFILE=commercial`, `PNPM_VERSION=11.26.0` |
| Versión Node                       | `26.8.2`, fijada en `.node-version`                   |

`build:pages` valida los datos comerciales, compila Astro y genera `_headers` en `dist`. La salida contiene `404.html`, por lo que Pages sirve una página 404 real para rutas ausentes. Los archivos `robots.txt` y `sitemap.xml` se generan en el build con el canónico `https://puertamasabierta.com.co`.

En el sistema de build v3 de Pages, `pnpm-lock.yaml` y `package.json` no seleccionan la versión de pnpm. Por eso se fija `PNPM_VERSION=11.26.0` en Cloudflare; `.node-version` selecciona Node 26.8.2. La instalación automática debe usar el lockfile versionado.

## Antes de conectar GitHub

1. Revisar el diff y el resultado de `pnpm run verify` y `pnpm run build:pages`. No subir el HTML autocontenido, referencias históricas, capturas, expedientes locales ni archivos privados al repositorio público de publicación.
2. Aprobar el commit/candidato exacto y el destino remoto. El `origin` del checkout local puede apuntar a otro repositorio: comprobarlo antes de subir.
3. En Cloudflare, conectar el repositorio y configurar los campos de la tabla. Configurar `puertamasabierta.com.co` como dominio personalizado sin modificar registros de correo (MX, SPF, DKIM o DMARC).
4. Tras la primera publicación, verificar en la URL real: portada, mapa, correo, 404, `robots.txt`, `sitemap.xml`, canonical, CSP, recursos y experiencia móvil. Comprobar también que la dirección `*.pages.dev` no se indexa.

La cabecera CSP de `_headers` se genera con los hashes de los bloques inline del build. No editar ese archivo generado a mano. Cloudflare aplica `_headers` a respuestas de assets estáticos; el servidor de pruebas local emula cabeceras, pero no sustituye la comprobación en Pages.

Fuentes: [integración Git de Cloudflare Pages](https://developers.cloudflare.com/pages/get-started/git-integration/), [configuración del build](https://developers.cloudflare.com/pages/configuration/build-configuration/), [imagen de build y versiones](https://developers.cloudflare.com/pages/configuration/build-image/), [cabeceras](https://developers.cloudflare.com/pages/configuration/headers/) y [páginas 404](https://developers.cloudflare.com/pages/configuration/serving-pages/).
