import { enforceRateLimit } from "./_ratelimit.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const rl = enforceRateLimit(req, { bucket: "iorb", max: 120, windowMs: 60_000 });
    res.setHeader("X-RateLimit-Limit", "120");
    res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    if (!rl.ok) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    const cosd = String(req.query.cosd || "");
    const coed = String(req.query.coed || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cosd) || !/^\d{4}-\d{2}-\d{2}$/.test(coed)) {
      res.status(400).json({ error: "Invalid cosd/coed" });
      return;
    }
    const u = new URL("https://fred.stlouisfed.org/graph/fredgraph.csv");
    u.searchParams.set("id", "IORB");
    u.searchParams.set("cosd", cosd);
    u.searchParams.set("coed", coed);

    const r = await fetch(u.toString(), { headers: { accept: "application/csv,text/plain,*/*" } });
    const txt = await r.text();
    res.setHeader("Content-Type", "application/csv; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(r.status).send(txt);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

