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

test("Wheel zoom preserves the date under the pointer and clamps at history limits", async () => {
  const { anchoredWindow } = await import("../lib/chart-range.js");
  assert.deepEqual(anchoredWindow(100, 0, 99, 0.5, 0), [0, 49]);
  assert.deepEqual(anchoredWindow(100, 0, 99, 0.5, 1), [50, 99]);
  assert.deepEqual(anchoredWindow(100, 50, 99, 2, 1), [0, 99]);
});

test("Two fingers expand and contract the visible interval without changing data", async () => {
  const { touchWindow } = await import("../lib/chart-range.js");
  assert.deepEqual(
    touchWindow(
      100,
      0,
      99,
      [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      [
        { x: 50, y: 0 },
        { x: 250, y: 0 },
      ],
      400,
      0.5,
    ),
    [25, 74],
  );
  assert.deepEqual(
    touchWindow(
      100,
      25,
      74,
      [
        { x: 50, y: 0 },
        { x: 250, y: 0 },
      ],
      [
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ],
      400,
      0.5,
    ),
    [0, 99],
  );
  assert.deepEqual(
    touchWindow(100, 25, 74, [{ x: 100, y: 0 }], [{ x: 200, y: 0 }], 500, 0.5),
    [15, 64],
  );
  assert.deepEqual(touchWindow(100, 25, 74, [], [], 500, 0.5), [25, 74]);
});
