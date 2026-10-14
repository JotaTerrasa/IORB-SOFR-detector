import { readSnapshot } from "./_snapshot.js";
import { begin } from "./_shared.js";
import { calendarSources, parseCalendar } from "../lib/calendar-data.js";
const cache = new Map();
export default async function handler(req, res) {
  if (!begin(req, res, "calendar")) return;
  const key = req.query?.type;
  if (!Object.hasOwn(calendarSources, key))
    return res.status(400).json({ error: "Calendario no válido" });
  const source = calendarSources[key],
    old = cache.get(key);
  if (old && Date.now() - Date.parse(old.fetchedAt) < 3600000)
    return res.status(200).json(old);
  try {
    const r = await fetch(source.url, {
      signal: AbortSignal.timeout(10000),
      headers: { "User-Agent": "MarketDesk/3.1 (public economic calendar)" },
    });
    if (!r.ok) throw Error("Fuente no disponible");
    const value = {
      ...source,
      rows: parseCalendar(await r.text(), key),
      fetchedAt: new Date().toISOString(),
    };
    cache.set(key, value);
    res.status(200).json(value);
  } catch {
    if (old) return res.status(200).json({ ...old, stale: true });
    try {
      const copy = (await readSnapshot("calendar")).sources?.[key];
      if (copy?.rows?.length && Number.isFinite(Date.parse(copy.fetchedAt)))
        return res.status(200).json({ ...copy, stale: true });
    } catch {}
    res.status(502).json({
      error:
        "No se ha podido consultar el calendario oficial. Reintenta o abre la fuente.",
    });
  }
}
