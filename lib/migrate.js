// Preserve v1 data locally. The original records remain untouched for recovery.
export function legacyNumber(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string" || !value.trim()) return null;
  let s = value.replace(/[\s\u00a0]/g, "");
  if (s.includes(",") && s.includes("."))
    s =
      s.lastIndexOf(",") > s.lastIndexOf(".")
        ? s.replaceAll(".", "").replace(",", ".")
        : s.replaceAll(",", "");
  else if (s.includes(",")) s = s.replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}
export function migrateJournal(records) {
  if (!Array.isArray(records)) return [];
  return records
    .slice(0, 500)
    .map((r, i) => ({
      id: String(r.id || "legacy-" + i),
      at: String(r.when || "").replace(" ", "T"),
      side: ["LONG", "SHORT"].includes(r.side) ? r.side : "NEUTRAL",
      entry: legacyNumber(r.entry),
      stop: legacyNumber(r.stop),
      target: legacyNumber(r.target),
      qty: legacyNumber(r.qtyBtc),
      result: Number.isFinite(r.r) ? r.r : null,
      legacy: true,
    }));
}
