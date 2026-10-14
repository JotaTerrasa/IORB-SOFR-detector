const prefix = "market-chart-view:v1:";
export function readChartView(id, storage = globalThis.localStorage) {
  try {
    const value = JSON.parse(storage.getItem(prefix + id));
    if (!value || typeof value !== "object") return {};
    const range = value.range;
    return {
      expanded: value.expanded === true,
      ...(Array.isArray(range) &&
      range.length === 2 &&
      range.every(
        (d) =>
          typeof d === "string" &&
          /^\d{4}-\d{2}-\d{2}$/.test(d) &&
          Number.isFinite(Date.parse(d)),
      ) &&
      range[0] <= range[1]
        ? { range }
        : {}),
    };
  } catch {
    return {};
  }
}
export function saveChartView(id, patch, storage = globalThis.localStorage) {
  try {
    storage.setItem(
      prefix + id,
      JSON.stringify({ ...readChartView(id, storage), ...patch }),
    );
  } catch {}
}
