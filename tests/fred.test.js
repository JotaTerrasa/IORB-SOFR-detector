import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSnapshot, fredSeries } from "../api/_fred.js";
test("expired or unverified FRED snapshots are rejected", () => {
  assert.throws(() => validateSnapshot({}));
  assert.throws(() =>
    validateSnapshot({ generatedAt: "2020-01-01", series: {} }),
  );
  const s = {
    generatedAt: new Date().toISOString(),
    series: Object.fromEntries(
      ["IORB", "WTREGEN", "WRESBAL", "RRPONTSYD"].map((id) => [
        id,
        [{ date: "2026-10-01", value: 3.9 }],
      ]),
    ),
  };
  assert.equal(validateSnapshot(s), s);
});
test("FRED outage uses dated official observations rather than invented defaults", async () => {
  const bundle = JSON.parse(
    await readFile(
      new URL("../data/fred-snapshot.json", import.meta.url),
      "utf8",
    ),
  );
  const previous = global.fetch,
    previousNow = Date.now;
  Date.now = () => Date.parse(bundle.generatedAt) + 1;
  global.fetch = async () => ({ ok: false, status: 403 });
  try {
    const end = new Date(Date.now()).toISOString().slice(0, 10),
      start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const result = await fredSeries("IORB", start, end);
    assert.equal(result.sourceMode, "verified-snapshot");
    assert.ok(result.sourceFetchedAt);
    assert.ok(result.rows.length > 0);
    assert.ok(result.rows.every((r) => r.date >= start && r.date <= end));
  } finally {
    global.fetch = previous;
    Date.now = previousNow;
  }
});
