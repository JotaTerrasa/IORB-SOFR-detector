export default async function handler(req, res) {
  try {
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

