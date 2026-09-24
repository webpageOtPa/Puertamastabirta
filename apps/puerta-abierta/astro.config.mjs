// @ts-check
import { defineConfig } from "astro/config";

// Puerta Abierta: sitio estático. No se añade adaptador SSR ni funciones de servidor.
export default defineConfig({
  output: "static",
  site: "https://puertamasabierta.com.co",
  trailingSlash: "ignore",
  build: {
    format: "directory",
    inlineStylesheets: "auto",
  },
  server: {
    port: 4321,
    host: true,
  },
  devToolbar: {
    enabled: false,
  },
});
