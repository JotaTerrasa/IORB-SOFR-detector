import test from "node:test";
import assert from "node:assert/strict";
import { chartUnit, chartValue, chartDate } from "../lib/chart-format.js";
test("Chart units distinguish dual axes and daily flows", () => {
  assert.equal(chartUnit("mainChart", "spread"), "pb");
  assert.equal(chartUnit("mainChart", "btc"), "USD");
  assert.equal(chartUnit("repoChart"), "mil M$/día");
  assert.equal(chartUnit("projectCompareChart"), "índice");
});
test("Chart labels preserve category text, null and small repo values", () => {
  assert.equal(chartDate("2 años", true), "2 años");
  assert.equal(chartValue(null, "%"), "—");
  assert.match(chartValue(0.01, "mil M$/día"), /0,01/);
  assert.match(chartDate("2026-10-14"), /2026/);
});
