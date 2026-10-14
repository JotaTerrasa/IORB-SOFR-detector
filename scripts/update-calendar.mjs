import { readFile, writeFile } from "node:fs/promises";
import { calendarSources, parseCalendar } from "../lib/calendar-data.js";
const file = new URL("../data/calendar-snapshot.json", import.meta.url);
let old = {};
try {
  old = JSON.parse(await readFile(file, "utf8"));
} catch {}
const sources = { ...old.sources };
for (const [key, source] of Object.entries(calendarSources)) {
  try {
    const r = await fetch(source.url, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) throw Error("Fuente no disponible");
    sources[key] = {
      ...source,
      rows: parseCalendar(await r.text(), key),
      fetchedAt: new Date().toISOString(),
    };
  } catch {
    console.log(key + ": se conserva la última copia fechada");
  }
}
if (!Object.keys(sources).length) throw Error("No hay calendarios verificados");
await writeFile(
  file,
  JSON.stringify({ generatedAt: new Date().toISOString(), sources }, null, 2) +
    "\n",
);
