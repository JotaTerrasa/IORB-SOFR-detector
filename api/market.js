import { begin, upstream, fail } from "./_shared.js";
export default async function handler(req, res) {
  if (!begin(req, res, "market")) return;
  const base = "https://api.exchange.coinbase.com/products/BTC-USD";
  try {
    if (req.query.kind === "quote") {
      const stats = await upstream(`${base}/stats`);
      if (!Number.isFinite(Number(stats.last)) || Number(stats.last) <= 0)
        throw new Error("Precio inválido");
      res.setHeader("Cache-Control", "public, s-maxage=15");
      res
        .status(200)
        .json({
          price: Number(stats.last),
          change24h:
            Number(stats.open) > 0
              ? (Number(stats.last) / Number(stats.open) - 1) * 100
              : null,
          fetchedAt: new Date().toISOString(),
          source: "Coinbase BTC-USD spot",
        });
      return;
    }
    const days = Number(req.query.days);
    if (req.query.kind !== "history" || ![90, 180, 365].includes(days)) {
      res.status(400).json({ error: "Ventana inválida." });
      return;
    }
    const end = new Date();
    end.setUTCHours(0, 0, 0, 0);
    const start = new Date(end.getTime() - (days + 150) * 86400000);
    const chunks = [];
    for (let t = start.getTime(); t < end.getTime(); t += 250 * 86400000) {
      const stop = Math.min(end.getTime(), t + 250 * 86400000);
      chunks.push(
        upstream(
          `${base}/candles?${new URLSearchParams({ granularity: "86400", start: new Date(t).toISOString(), end: new Date(stop).toISOString() })}`,
        ),
      );
    }
    const raw = (await Promise.all(chunks)).flat(),
      unique = new Map();
    for (const row of raw) {
      if (
        !Array.isArray(row) ||
        row.length < 6 ||
        !row.every((x) => Number.isFinite(Number(x)))
      )
        continue;
      const [t, l, h, o, c, v] = row.map(Number);
      if (
        t * 1000 < start.getTime() ||
        t * 1000 >= end.getTime() ||
        Math.min(l, h, o, c) <= 0 ||
        h < Math.max(o, c, l) ||
        l > Math.min(o, c, h)
      )
        continue;
      unique.set(t, {
        date: new Date(t * 1000).toISOString().slice(0, 10),
        o,
        h,
        l,
        c,
        v,
      });
    }
    const candles = Array.from(unique.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    if (!candles.length) throw new Error("Histórico vacío");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=300",
    );
    res
      .status(200)
      .json({
        candles,
        source: "Coinbase BTC-USD · velas diarias UTC cerradas",
        fetchedAt: new Date().toISOString(),
      });
  } catch {
    fail(res);
  }
}
