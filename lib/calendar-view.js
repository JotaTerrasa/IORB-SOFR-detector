import { calendarSources } from "./calendar-data.js";
const $ = (id) => document.getElementById(id);
const date = (s) =>
  new Date(s + "T12:00:00Z").toLocaleDateString("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
let request = 0;
export function initCalendar() {
  document
    .querySelectorAll("[data-calendar]")
    .forEach((button) =>
      button.addEventListener("click", () =>
        showCalendar(button.dataset.calendar),
      ),
    );
  $("calendarRetry").addEventListener("click", () =>
    showCalendar($("calendarPanel").dataset.type),
  );
}
async function showCalendar(key) {
  const token = ++request,
    source = calendarSources[key],
    panel = $("calendarPanel");
  panel.hidden = false;
  panel.dataset.type = key;
  document
    .querySelectorAll("[data-calendar]")
    .forEach((b) =>
      b.setAttribute("aria-expanded", String(b.dataset.calendar === key)),
    );
  $("calendarTitle").textContent = source.title;
  $("calendarSource").href = source.url;
  $("calendarRows").replaceChildren();
  $("calendarStatus").textContent = "Consultando calendario oficial…";
  $("calendarRetry").hidden = true;
  $("calendarExplanation").textContent =
    key === "fed"
      ? "Fechas de reunión del FOMC. Las reuniones marcadas incluyen proyecciones económicas."
      : "Fechas de publicación del BLS. Horas de Nueva York; el mes de referencia corresponde al dato que se publica.";
  try {
    const response = await fetch("/api/calendar?type=" + key, {
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error("No disponible");
    const data = await response.json();
    if (token !== request) return;
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const rows = data.rows.filter((r) => r.date >= today).slice(0, 6);
    for (const r of rows) {
      const item = document.createElement("li"),
        title = document.createElement("strong"),
        detail = document.createElement("span");
      title.textContent =
        r.start && r.start !== r.date
          ? date(r.start) + " — " + date(r.date)
          : date(r.date);
      detail.textContent =
        key === "fed"
          ? r.projections
            ? "Con proyecciones económicas"
            : "Reunión del FOMC"
          : r.time +
            " · Nueva York · dato de " +
            new Date(r.period + " 1 12:00:00 GMT").toLocaleDateString("es-ES", {
              month: "long",
              year: "numeric",
              timeZone: "UTC",
            });
      item.append(title, detail);
      $("calendarRows").append(item);
    }
    $("calendarStatus").textContent =
      (data.stale ? "Copia de respaldo · " : "Consultado: ") +
      new Date(data.fetchedAt).toLocaleString("es-ES") +
      (rows.length
        ? " · próximas fechas publicadas; sujetas a cambios."
        : " · no hay próximas fechas disponibles en esta fuente.");
  } catch {
    if (token !== request) return;
    $("calendarStatus").textContent =
      "No se ha podido cargar el calendario. Puedes reintentar o consultar la fuente oficial.";
    $("calendarRetry").hidden = false;
  }
}
