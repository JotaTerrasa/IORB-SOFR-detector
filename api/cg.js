import { enforceRateLimit } from "./_ratelimit.js";

export default async function handler(req, res) {
  try {
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      res.status(405).json({ error: "Method not allowed" });
      return;
    }
    const rl = enforceRateLimit(req, { bucket: "cg", max: 90, windowMs: 60_000 });
    res.setHeader("X-RateLimit-Limit", "90");
    res.setHeader("X-RateLimit-Remaining", String(rl.remaining));
    res.setHeader("Retry-After", String(rl.retryAfterSec));
    if (!rl.ok) {
      res.status(429).json({ error: "Too many requests" });
      return;
    }

    const path = String(req.query.path || "");
    if (!path.startsWith("/")) {
      res.status(400).json({ error: "Missing or invalid path" });
      return;
    }
    // allowlist a few endpoints we use
    const allowed = [
      "/coins/markets",
      "/coins/bitcoin/market_chart",
      "/coins/bitcoin/ohlc",
    ];
    if (!allowed.some((p) => path.startsWith(p))) {
      res.status(403).json({ error: "Path not allowed" });
      return;
    }
    const url = new URL("https://api.coingecko.com/api/v3" + path);
    for (const [k, v] of Object.entries(req.query)) {
      if (k === "path") continue;
      url.searchParams.set(k, String(v));
    }
    const r = await fetch(url.toString(), {
      headers: { accept: "application/json" },
    });
    const txt = await r.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    // Cache at the edge to reduce 429s
    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
    res.status(r.status).send(txt);
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
}

