import test from "node:test";
import assert from "node:assert/strict";
import { dateWindow, zoomWindow } from "../lib/chart-range.js";
test("Date ranges include boundaries and preserve gaps and source indices", () => {
  assert.deepEqual(
    dateWindow(
      ["2026-01-01", "2026-01-03", "2026-01-07"],
      "2026-01-02",
      "2026-01-07",
    ),
    [1, 2],
  );
  assert.deepEqual(dateWindow(["2026-01-01"], "2026-02-01", "2026-02-02"), []);
});
test("Zoom and pan remain within history, including small series", () => {
  assert.deepEqual(zoomWindow(100, 0, 99, 0.5), [25, 74]);
  assert.deepEqual(zoomWindow(100, 25, 74, 2), [0, 99]);
  assert.deepEqual(zoomWindow(100, 0, 49, 1, -0.5), [0, 49]);
  assert.deepEqual(zoomWindow(1, 0, 0, 0.5), [0, 0]);
});
