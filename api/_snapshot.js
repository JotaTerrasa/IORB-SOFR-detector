import { readFile } from "node:fs/promises";
export async function readSnapshot(name) {
  let copy;
  try {
    const r = await fetch(
      `https://raw.githubusercontent.com/JotaTerrasa/IORB-SOFR-detector/data-feed/data/${name}-snapshot.json`,
      { signal: AbortSignal.timeout(4000) },
    );
    if (!r.ok) throw Error("Sin copia");
    copy = await r.json();
  } catch {
    copy = JSON.parse(
      await readFile(
        new URL(`../data/${name}-snapshot.json`, import.meta.url),
        "utf8",
      ),
    );
  }
  if (
    !Number.isFinite(Date.parse(copy.generatedAt)) ||
    Date.parse(copy.generatedAt) > Date.now() + 300000
  )
    throw Error("Copia inválida");
  return {
    ...copy,
    snapshotAgeHours: (Date.now() - Date.parse(copy.generatedAt)) / 3600000,
    sourceMode: "snapshot",
  };
}
