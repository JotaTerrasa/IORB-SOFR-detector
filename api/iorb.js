import { begin, range, fail } from "./_shared.js";
import { fredSeries } from "./_fred.js";
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
    const { rows, sourceMode, sourceFetchedAt } = await fredSeries(
      "IORB",
      start,
      end,
    );
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("X-Data-Source", sourceMode);
    res.setHeader("X-Data-Fetched-At", sourceFetchedAt);
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=300, stale-while-revalidate=300",
    );
    res
      .status(200)
      .send(
        "observation_date,IORB\n" +
          rows.map((r) => `${r.date},${r.value}`).join("\n") +
          "\n",
      );
  } catch {
    fail(res);
  }
}
