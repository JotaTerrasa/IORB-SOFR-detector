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

export function clearChartViews(storage = globalThis.localStorage) {
  try {
    const keys = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix) || key === "market-project-range:v1")
        keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

export function captureChartViews(storage = globalThis.localStorage) {
  try {
    const result = {};
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(prefix) || key === "market-project-range:v1")
        result[key] = storage.getItem(key);
    }
    return result;
  } catch {
    return null;
  }
}
export function restoreChartViews(snapshot, storage = globalThis.localStorage) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot))
    return false;
  try {
    if (!clearChartViews(storage)) return false;
    for (const [key, value] of Object.entries(snapshot)) {
      if (
        (key.startsWith(prefix) || key === "market-project-range:v1") &&
        typeof value === "string"
      )
        storage.setItem(key, value);
    }
    return true;
  } catch {
    return false;
  }
}
