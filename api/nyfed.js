import { enforceRateLimit } from "./_ratelimit.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const rl = enforceRateLimit(req, { bucket: "nyfed", max: 120, windowMs: 60_000 });
    res.setHeader("X-RateLimit-Limit", "120");
    res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    if (!rl.ok) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    const kind = String(req.query.kind || "");
    let url = null;
    if (kind === "sofr_last") {
      url = "https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json";
    } else if (kind === "sofr_search") {
      const startDate = String(req.query.startDate || "");
      const endDate = String(req.query.endDate || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
        res.status(400).json({ error: "Invalid startDate/endDate" });
        return;
      }
      const u = new URL("https://markets.newyorkfed.org/api/rates/secured/sofr/search.json");
      u.searchParams.set("startDate", startDate);
      u.searchParams.set("endDate", endDate);
      url = u.toString();
    } else {
      res.status(400).json({ error: "Invalid kind" });
      return;
    }

    const r = await fetch(url, { headers: { accept: "application/json" } });
    const txt = await r.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=3600");
    res.status(r.status).send(txt);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

