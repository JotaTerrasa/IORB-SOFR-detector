import { readFile } from "node:fs/promises";
import { csvSeries } from "../lib/analytics.js";
const SNAPSHOT_URL =
  "https://raw.githubusercontent.com/JotaTerrasa/IORB-SOFR-detector/data-feed/data/fred-snapshot.json";
let snapshotPromise = null,
  loadedAt = 0;
export function validateSnapshot(snapshot, now = Date.now()) {
  if (
    !snapshot?.generatedAt ||
    !snapshot.series ||
    !Number.isFinite(Date.parse(snapshot.generatedAt)) ||
    now - Date.parse(snapshot.generatedAt) > 72 * 3600000
  )
    throw new Error("La copia verificada de FRED necesita actualizarse.");
  return snapshot;
}
async function snapshot() {
  if (!snapshotPromise || Date.now() - loadedAt > 15 * 60000) {
    loadedAt = Date.now();
    snapshotPromise = (async () => {
      try {
        const r = await fetch(SNAPSHOT_URL, {
          signal: AbortSignal.timeout(4000),
        });
        if (!r.ok) throw new Error("Snapshot unavailable");
        return validateSnapshot(await r.json());
      } catch {
        return validateSnapshot(
          JSON.parse(
            await readFile(
              new URL("../data/fred-snapshot.json", import.meta.url),
              "utf8",
            ),
          ),
        );
      }
    })();
  }
  return snapshotPromise;
}
export async function fredSeries(id, start, end) {
  try {
    const u = new URL("https://fred.stlouisfed.org/graph/fredgraph.csv");
    u.search = new URLSearchParams({ id, cosd: start, coed: end });
    const r = await fetch(u, {
      signal: AbortSignal.timeout(4000),
      headers: { accept: "text/csv" },
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const rows = csvSeries(await r.text(), id);
    if (!rows.length) throw new Error("Empty FRED series");
    return {
      rows,
      sourceMode: "direct",
      sourceFetchedAt: new Date().toISOString(),
    };
  } catch {
    const copy = await snapshot();
    const rows = (copy.series[id] || []).filter(
      (r) => r.date >= start && r.date <= end,
    );
    if (!rows.length) throw new Error("La copia no cubre el rango solicitado.");
    return {
      rows,
      sourceMode: "verified-snapshot",
      sourceFetchedAt: copy.generatedAt,
    };
  }
}
