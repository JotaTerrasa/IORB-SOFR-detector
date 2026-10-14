export function finite(v) {
  if (v === null || v === undefined || v === "" || v === "null") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
export function tgaRows(payload) {
  if (
    !Array.isArray(payload?.data) ||
    Number(payload.meta?.total_pages || 1) > 1
  )
    throw Error("TGA incompleto");
  const rows = payload.data
    .filter(
      (x) =>
        x.account_type === "Treasury General Account (TGA) Closing Balance",
    )
    .map((x) => ({
      date: x.record_date,
      value:
        finite(x.open_today_bal) === null
          ? null
          : finite(x.open_today_bal) / 1000,
    }));
  return cleanRows(rows);
}
export function cleanRows(rows) {
  return [
    ...new Map(
      rows
        .filter(
          (r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.value),
        )
        .map((r) => [r.date, r]),
    ).values(),
  ].sort((a, b) => a.date.localeCompare(b.date));
}
export function repoRows(payload) {
  if (!Array.isArray(payload?.repo?.operations))
    throw Error("Repos no disponibles");
  const seen = new Set(),
    totals = new Map();
  for (const x of payload.repo.operations) {
    if (
      x.operationType !== "Repo" ||
      x.auctionStatus !== "Results" ||
      seen.has(x.operationId)
    )
      continue;
    seen.add(x.operationId);
    const n = finite(x.totalAmtAccepted);
    if (n !== null)
      totals.set(x.operationDate, (totals.get(x.operationDate) || 0) + n / 1e9);
  }
  return cleanRows([...totals].map(([date, value]) => ({ date, value })));
}
export function change(rows, observations = 1) {
  if (rows.length <= observations) return null;
  return rows.at(-1).value - rows.at(-1 - observations).value;
}
export function commonDate(series) {
  if (!series.length || series.some((s) => !s?.length)) return null;
  const sets = series.slice(1).map((s) => new Set(s.map((r) => r.date)));
  return (
    series[0]
      .map((r) => r.date)
      .filter((d) => sets.every((s) => s.has(d)))
      .at(-1) || null
  );
}
export function yieldDeltaBp(value, relativeChange) {
  return Number.isFinite(value) &&
    Number.isFinite(relativeChange) &&
    relativeChange !== -100
    ? (value - value / (1 + relativeChange / 100)) * 100
    : null;
}
export function validatePortfolio(rows) {
  if (!Array.isArray(rows) || rows.length !== 6)
    throw Error("Se necesitan seis activos.");
  const symbols = ["USDT", "STONK", "SOL", "ASTER", "PUMP", "PURR"];
  if (
    rows.some(
      (r, i) =>
        r.symbol !== symbols[i] ||
        !Number.isFinite(r.weight) ||
        r.weight < 0 ||
        r.weight > 100 ||
        ["average", "lastBuy", "alternative", "manualPrice"].some(
          (k) => r[k] !== null && (!Number.isFinite(r[k]) || r[k] <= 0),
        ),
    )
  )
    throw Error("Revisa los pesos y precios: deben ser números positivos.");
  if (Math.abs(rows.reduce((a, r) => a + r.weight, 0) - 100) > 0.001)
    throw Error("Los pesos deben sumar 100 %.");
  return rows;
}
export function referenceReturn(price, average) {
  return Number.isFinite(price) &&
    price > 0 &&
    Number.isFinite(average) &&
    average > 0
    ? (price / average - 1) * 100
    : null;
}
export function scenario(rows, moves) {
  validatePortfolio(rows);
  return rows.reduce(
    (n, r) =>
      n +
      (r.weight / 100) *
        (Number.isFinite(moves[r.symbol]) ? moves[r.symbol] : 0),
    0,
  );
}
