export function chartUnit(id, axisId) {
  if (id === "mainChart") return axisId === "spread" ? "pb" : "USD";
  if (id === "macroChart" || id === "tgaDailyChart") return "mil M$";
  if (id === "repoChart") return "mil M$/día";
  if (id === "curveChart" || id === "realChart") return "%";
  if (id === "projectCompareChart") return "índice";
  return "USD";
}
export function chartValue(value, unit, compact = false) {
  if (!Number.isFinite(Number(value)) || value === null) return "—";
  const formatted = Number(value).toLocaleString("es-ES", {
    maximumFractionDigits: compact ? 1 : unit === "%" ? 3 : 2,
    ...(compact && Math.abs(value) >= 10000 ? { notation: "compact" } : {}),
  });
  return formatted + (unit ? " " + unit : "");
}
export function chartDate(label, short = false) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(label)) return label || "";
  return new Date(label + "T12:00:00Z").toLocaleDateString("es-ES", {
    day: "2-digit",
    month: short ? "short" : "long",
    ...(short ? {} : { year: "numeric" }),
    timeZone: "UTC",
  });
}
