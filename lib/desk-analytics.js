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

// Calendar windows end at the latest published observation, without filling gaps.
export function calendarWindow(rows, days) {
  rows = [...new Map(rows.map((r) => [r.date, r])).values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (days === "all" || !rows.length) return rows;
  const n = Number(days);
  if (!Number.isFinite(n) || n < 1) return [];
  const end = Date.parse(rows.at(-1).date + "T00:00:00Z");
  return rows.filter(
    (r) => Date.parse(r.date + "T00:00:00Z") > end - n * 86400000,
  );
}

export function datedChange(rows, days) {
  const clean = cleanRows(rows);
  const last = clean.at(-1);
  if (!last) return null;
  const target = new Date(
    Date.parse(last.date + "T12:00:00Z") - days * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const base = clean.find((r) => r.date === target);
  return base && base.value > 0 ? (last.value / base.value - 1) * 100 : null;
}
export function indexedComparison(a, b, days) {
  const left = calendarWindow(cleanRows(a), days),
    right = calendarWindow(cleanRows(b), days);
  const rightMap = new Map(right.map((r) => [r.date, r.value]));
  const dates = left.filter((r) => rightMap.has(r.date)).map((r) => r.date);
  const leftMap = new Map(left.map((r) => [r.date, r.value]));
  if (
    !dates.length ||
    leftMap.get(dates[0]) <= 0 ||
    rightMap.get(dates[0]) <= 0
  )
    return { dates: [], a: [], b: [] };
  return {
    dates,
    a: dates.map((d) => (leftMap.get(d) / leftMap.get(dates[0])) * 100),
    b: dates.map((d) => (rightMap.get(d) / rightMap.get(dates[0])) * 100),
  };
}
