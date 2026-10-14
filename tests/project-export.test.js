import test from "node:test";
import assert from "node:assert/strict";
import { projectExportRows, csvText } from "../lib/project-export.js";
test("Project CSV preserves numeric zero, missing data and source failure dates", () => {
  const rows = projectExportRows({
    sources: {
      fees: {
        fetchedAt: "2026-10-01T00:00:00Z",
        error: "offline",
        value: [{ name: "A", total24h: 0, total7d: null }],
      },
    },
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[1][2], 0);
  assert.equal(rows[1][5], "");
  assert.equal(rows[1][6], "2026-10-01T00:00:00Z");
  assert.match(rows[1][7], /copia/);
});
test("CSV quotes delimiters and neutralizes spreadsheet formulas without changing numbers", () => {
  const result = csvText([["=cmd", "a;b", '"quoted"', -2]]);
  assert.equal(result, '\uFEFF"\'=cmd";"a;b";"""quoted""";"-2"');
});
test("Project exports exclude the incomplete UTC day", () => {
  const rows = projectExportRows({
    sources: {
      stonkDaily: {
        value: {
          rows: [{ date: new Date().toISOString().slice(0, 10), revenue: 100 }],
        },
      },
    },
  });
  assert.equal(rows.length, 1);
});
