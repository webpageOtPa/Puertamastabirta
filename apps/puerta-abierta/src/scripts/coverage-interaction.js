// coverage-interaction.js — pegamento DOM de la cobertura (PA-08)
// ---------------------------------------------------------------------------
// Mejora progresiva OPCIONAL de Puerta Abierta. Módulo local empaquetado
// por Astro SÓLO cuando Cobertura.astro publica el tag (flag de build
// `coverageInteraction` habilitado); con el flag deshabilitado no hay
// tag, ni descarga, ni archivo en `dist` (PA-Q019/PA-Q020). Sin red
// remota, sin querystring, sin persistencia, sin terceros.
//
// El tag se emite como módulo diferido: no bloquea la lectura.
//
// Estado por clausura (una instancia por sección); IDs desconocidos o
// vacíos → estado estable sin excepción. Los controles de lista y mapa se
// activan al arrancar: sin script, la lista sigue como texto y los marcadores
// permanecen decorativos. Las reglas puras
// (normalizar/resolver) viven en `src/lib/coverage-interaction.ts` y se
// prueban en unit; aquí sólo hay presentador DOM, probado en E2E.

(() => {
  const root = document.getElementById("cobertura");
  if (!root) return;
  const select = root.querySelector("[data-cobertura-selector]");
  const status = root.querySelector("[data-cobertura-status]");
  const controls = root.querySelector("[data-cobertura-controls]");
  const mapMarkersEnabled = root.getAttribute("data-cobertura-map-markers") === "true";
  if (!(select instanceof HTMLSelectElement)) return;
  // Reapertura/montaje repetido: no duplicar listeners.
  if (select.dataset.coberturaBound === "true") return;
  select.dataset.coberturaBound = "true";

  const items = Array.from(root.querySelectorAll("[data-city-id].cobertura__ciudad"));
  const points = Array.from(root.querySelectorAll(".cobertura-punto[data-city-id]"));
  const pointGroup = points[0]?.parentElement;
  const buttons = items.map((item) => {
    const id = item.getAttribute("data-city-id");
    const name = (item.textContent || "").trim();
    const button = document.createElement("button");
    button.type = "button";
    button.className = "cobertura__ciudad-boton";
    button.setAttribute("data-cobertura-city-button", "");
    button.setAttribute("data-city-id", id || "");
    button.setAttribute("aria-pressed", "false");
    button.textContent = name;
    item.replaceChildren(button);
    button.addEventListener("click", () => apply(id));
    return button;
  });
  if (mapMarkersEnabled) {
    for (const point of points) {
      const id = point.getAttribute("data-city-id");
      const item = items.find((candidate) => candidate.getAttribute("data-city-id") === id);
      if (!id || !item) continue;
      const name = (item.textContent || "").trim();
      const group = item.getAttribute("data-group-label") || "";
      point.removeAttribute("aria-hidden");
      point.setAttribute("data-cobertura-map-marker", "true");
      point.setAttribute("role", "button");
      point.setAttribute("tabindex", "0");
      point.setAttribute("aria-label", group ? `${name} — ${group}` : name);
      point.setAttribute("aria-pressed", "false");
      point.addEventListener("click", () => apply(id));
      point.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        apply(id);
      });
    }
  }
  const known = new Set(
    items
      .map((el) => el.getAttribute("data-city-id"))
      .filter((id) => typeof id === "string" && id !== ""),
  );
  const initialStatus = status ? status.textContent : "";

  function clearActive() {
    for (const el of items) el.classList.remove("cobertura__ciudad--activa");
    for (const el of points) {
      el.classList.remove("cobertura-punto--activo");
      if (el.getAttribute("role") === "button") el.setAttribute("aria-pressed", "false");
    }
    for (const button of buttons) button.setAttribute("aria-pressed", "false");
  }

  function restorePointOrder() {
    if (!pointGroup) return;
    for (const point of points) pointGroup.appendChild(point);
  }

  function apply(raw) {
    const id = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    // ID desconocido o vacío: estado estable, sin excepción.
    if (id === "" || !known.has(id)) {
      clearActive();
      restorePointOrder();
      select.value = "";
      if (status && initialStatus !== null) status.textContent = initialStatus;
      return;
    }
    clearActive();
    restorePointOrder();
    select.value = id;
    const item = items.find((el) => el.getAttribute("data-city-id") === id);
    const button = buttons.find((el) => el.getAttribute("data-city-id") === id);
    const point = points.find((el) => el.getAttribute("data-city-id") === id);
    if (item) item.classList.add("cobertura__ciudad--activa");
    if (button) button.setAttribute("aria-pressed", "true");
    if (point) {
      point.classList.add("cobertura-punto--activo");
      if (point.getAttribute("role") === "button") point.setAttribute("aria-pressed", "true");
      // Manizales y Pereira comparten píxeles en el mapa base. Poner el
      // marcador elegido al final del grupo lo dibuja por encima sin
      // alterar sus coordenadas ni el orden inicial cuando se limpia.
      pointGroup?.appendChild(point);
    }
    if (status && item) {
      const name = (item.textContent || "").trim();
      const group = item.getAttribute("data-group-label") || "";
      status.textContent = group ? `${name} — ${group}.` : `${name}.`;
    }
  }

  select.addEventListener("change", () => apply(select.value));
  apply(select.value);
  controls?.removeAttribute("hidden");
})();
