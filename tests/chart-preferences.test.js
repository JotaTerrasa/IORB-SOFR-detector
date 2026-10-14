import test from "node:test";
import assert from "node:assert/strict";
import { readChartView, saveChartView } from "../lib/chart-preferences.js";
test("Chart preferences retain range and expansion independently across reads", () => {
  const data = new Map(),
    storage = {
      getItem: (k) => data.get(k),
      setItem: (k, v) => data.set(k, v),
    };
  saveChartView("chart", { range: ["2026-09-01", "2026-09-15"] }, storage);
  saveChartView("chart", { expanded: true }, storage);
  assert.deepEqual(readChartView("chart", storage), {
    range: ["2026-09-01", "2026-09-15"],
    expanded: true,
  });
  saveChartView("chart", { range: null }, storage);
  assert.deepEqual(readChartView("chart", storage), { expanded: true });
  assert.deepEqual(readChartView("other", storage), {});
});
test("Invalid saved data and unavailable storage do not prevent rendering", () => {
  assert.deepEqual(readChartView("chart", { getItem: () => "{invalid" }), {});
  assert.deepEqual(
    readChartView("chart", {
      getItem: () => JSON.stringify({ range: ["2026-10-01", "2026-09-01"] }),
    }),
    { expanded: false },
  );
  assert.doesNotThrow(() =>
    saveChartView(
      "chart",
      { expanded: true },
      {
        getItem: () => null,
        setItem: () => {
          throw Error("blocked");
        },
      },
    ),
  );
});

test("Reset removes only chart preferences and the project history selection", async () => {
  const { clearChartViews } = await import("../lib/chart-preferences.js");
  const data = new Map([
    ["market-chart-view:v1:a", "{}"],
    ["market-chart-view:v1:b", "{}"],
    ["market-project-range:v1", "all"],
    ["other-setting", "keep"],
    ["cached-data", "keep"],
  ]);
  const storage = {
    get length() {
      return data.size;
    },
    key: (i) => [...data.keys()][i],
    removeItem: (k) => data.delete(k),
  };
  assert.equal(clearChartViews(storage), true);
  assert.deepEqual([...data.keys()], ["other-setting", "cached-data"]);
  assert.equal(
    clearChartViews({
      get length() {
        throw Error("blocked");
      },
    }),
    false,
  );
});
