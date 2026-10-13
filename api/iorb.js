import { begin, range, upstream, fail } from "./_shared.js";
export default async function handler(req, res) {
  if (!begin(req, res, "iorb")) return;
  const start = String(req.query.cosd || ""),
    end = String(req.query.coed || "");
  if (!range(start, end)) {
    res
      .status(400)
      .json({ error: "Rango de fechas inválido (máximo 800 días)." });
    return;
  }
  try {
    const u = new URL("https://fred.stlouisfed.org/graph/fredgraph.csv");
    u.search = new URLSearchParams({ id: "IORB", cosd: start, coed: end });
    const text = await upstream(u, "text");
    if (!text.includes("IORB")) throw new Error("CSV inválido");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=300",
    );
    res.status(200).send(text);
  } catch {
    fail(res);
  }
}
