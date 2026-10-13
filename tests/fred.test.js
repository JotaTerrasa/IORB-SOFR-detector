import { test } from "node:test";
import assert from "node:assert/strict";
import { validateSnapshot, fredSeries } from "../api/_fred.js";
test("expired or unverified FRED snapshots are rejected", () => {
  assert.throws(() => validateSnapshot({}));
  assert.throws(() =>
    validateSnapshot({ generatedAt: "2020-01-01", series: {} }),
  );
  const s = { generatedAt: new Date().toISOString(), series: { IORB: [] } };
  assert.equal(validateSnapshot(s), s);
});
test("FRED outage uses dated official observations rather than invented defaults", async () => {
  const previous = global.fetch;
  global.fetch = async () => ({ ok: false, status: 403 });
  try {
    const end = new Date().toISOString().slice(0, 10),
      start = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const result = await fredSeries("IORB", start, end);
    assert.equal(result.sourceMode, "verified-snapshot");
    assert.ok(result.sourceFetchedAt);
    assert.ok(result.rows.length > 0);
    assert.ok(result.rows.every((r) => r.date >= start && r.date <= end));
  } finally {
    global.fetch = previous;
  }
});
