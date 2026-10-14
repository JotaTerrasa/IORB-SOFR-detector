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

test("Vertical swipes and small finger movements do not move chart dates", async () => {
  const { isHorizontalDrag } = await import("../lib/chart-range.js");
  const start = { x: 100, y: 100 };
  assert.equal(isHorizontalDrag(start, { x: 105, y: 180 }), false);
  assert.equal(isHorizontalDrag(start, { x: 104, y: 102 }), false);
  assert.equal(isHorizontalDrag(start, { x: 160, y: 110 }), true);
  assert.equal(isHorizontalDrag(start, { x: 40, y: 110 }), true);
});

test("Rotation cancels active touches and fresh gestures use the new chart dimensions", async (t) => {
  const { attachChartRange, resetChartRanges } = await import(
    "../lib/chart-range.js"
  );
  const viewport = new EventTarget();
  const previousWindow = globalThis.window;
  globalThis.window = viewport;
  t.after(() => {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  });
  const controls = new Map();
  const panel = {
    querySelector(selector) {
      if (!controls.has(selector)) controls.set(selector, {});
      return controls.get(selector);
    },
  };
  const captured = new Set();
  const classes = new Set();
  const canvas = Object.assign(new EventTarget(), {
    classList: {
      add: (...names) => names.forEach((name) => classes.add(name)),
      remove: (...names) => names.forEach((name) => classes.delete(name)),
    },
    parentElement: { parentElement: { querySelector: () => panel } },
    getBoundingClientRect: () => ({
      left: 0,
      top: 0,
      width: chart.width,
      height: chart.height,
    }),
    setPointerCapture: (id) => captured.add(id),
    hasPointerCapture: (id) => captured.has(id),
    releasePointerCapture: (id) => captured.delete(id),
  });
  const labels = Array.from({ length: 100 }, (_, i) =>
    new Date(Date.UTC(2026, 0, i + 1)).toISOString().slice(0, 10),
  );
  const chart = {
    width: 300,
    height: 420,
    chartArea: { left: 0, right: 300, top: 0, bottom: 420 },
    data: { labels, datasets: [{ data: labels.map((_, i) => i) }] },
    update() {},
  };
  const touch = (type, id, x, y) =>
    canvas.dispatchEvent(
      Object.assign(new Event(type), {
        pointerId: id,
        pointerType: "touch",
        button: 0,
        clientX: x,
        clientY: y,
      }),
    );
  attachChartRange("rotation-test", chart, canvas);
  touch("pointerdown", 1, 100, 100);
  touch("pointerdown", 2, 200, 100);
  chart.width = 700;
  chart.height = 300;
  chart.chartArea.right = 700;
  chart.chartArea.bottom = 300;
  viewport.dispatchEvent(new Event("resize"));
  assert.equal(captured.size, 0);
  assert.equal(classes.has("chart-dragging"), false);
  touch("pointermove", 1, 20, 100);
  assert.deepEqual(chart.data.labels, labels);
  touch("pointerdown", 3, 250, 100);
  touch("pointerdown", 4, 450, 100);
  touch("pointermove", 3, 150, 100);
  touch("pointermove", 4, 550, 100);
  assert.equal(chart.data.labels.length, 50);
  touch("pointerup", 3, 150, 100);
  touch("pointerup", 4, 550, 100);
  const zoomed = [...chart.data.labels];
  touch("pointerdown", 5, 350, 100);
  touch("pointermove", 5, 355, 200);
  assert.deepEqual(chart.data.labels, zoomed);
  touch("pointercancel", 5, 355, 200);
  touch("pointerdown", 6, 350, 100);
  touch("pointermove", 6, 420, 100);
  assert.equal(chart.data.labels.length, 50);
  assert.equal(
    labels.indexOf(chart.data.labels[0]),
    labels.indexOf(zoomed[0]) - 5,
  );
  touch("pointerup", 6, 420, 100);
  const panned = [...chart.data.labels];
  chart.width = 300;
  chart.height = 420;
  chart.chartArea.right = 300;
  chart.chartArea.bottom = 420;
  viewport.dispatchEvent(new Event("resize"));
  assert.deepEqual(chart.data.labels, panned);
  resetChartRanges();
});
