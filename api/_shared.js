import { enforceRateLimit } from "./_ratelimit.js";
export function begin(req, res, bucket) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return false;
  }
  const r = enforceRateLimit(req, { bucket, max: 90, windowMs: 60000 });
  res.setHeader("X-RateLimit-Limit", "90");
  res.setHeader("X-RateLimit-Remaining", String(r.remaining));
  if (!r.ok) {
    res.setHeader("Retry-After", String(r.retryAfterSec));
    res.status(429).json({ error: "Demasiadas consultas. Espera un minuto." });
    return false;
  }
  return true;
}
export function range(start, end, maxDays = 800) {
  const valid = (d) =>
    /^\d{4}-\d{2}-\d{2}$/.test(d) &&
    Number.isFinite(Date.parse(d)) &&
    new Date(d).toISOString().slice(0, 10) === d;
  return (
    valid(start) &&
    valid(end) &&
    end >= start &&
    Date.parse(end) - Date.parse(start) <= maxDays * 86400000
  );
}
export async function upstream(url, format = "json") {
  const r = await fetch(url, {
    signal: AbortSignal.timeout(12000),
    headers: {
      accept: format === "json" ? "application/json" : "text/csv",
    },
  });
  if (!r.ok) throw new Error(`Fuente no disponible (HTTP ${r.status})`);
  return format === "json" ? r.json() : r.text();
}
export function fail(res) {
  res
    .status(502)
    .json({ error: "La fuente no responde. Puedes volver a intentarlo." });
}
