import { readFile, writeFile } from "node:fs/promises";
import { csvSeries, day } from "../lib/analytics.js";
const ids = ["IORB", "WTREGEN", "WRESBAL", "RRPONTSYD"];
const end = day(new Date()),
  start = day(Date.now() - 800 * 86400000);
const series = {};
// Fetch serially to avoid stressing the source. Fail atomically: never replace with empty data.
for (const id of ids) {
  const u = new URL("https://fred.stlouisfed.org/graph/fredgraph.csv");
  u.search = new URLSearchParams({ id, cosd: start, coed: end });
  const r = await fetch(u, {
    signal: AbortSignal.timeout(45000),
    headers: { accept: "text/csv" },
  });
  if (!r.ok) throw new Error(`FRED ${id}: HTTP ${r.status}`);
  const rows = csvSeries(await r.text(), id);
  if (
    !rows.length ||
    new Date(end) - new Date(rows.at(-1).date) > 14 * 86400000
  )
    throw new Error(`FRED ${id}: empty or outdated`);
  series[id] = rows;
  console.log(id, rows.length, rows.at(-1).date);
}
const file = new URL("../data/fred-snapshot.json", import.meta.url);
let previous;
try {
  previous = JSON.parse(await readFile(file, "utf8"));
} catch {}
if (JSON.stringify(previous?.series) !== JSON.stringify(series))
  await writeFile(
    file,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        source: "FRED CSV official series",
        series,
      },
      null,
      2,
    ) + "\n",
  );
else console.log("No change in observations; keeping existing snapshot.");
