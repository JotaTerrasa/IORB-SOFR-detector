import test from "node:test";
import assert from "node:assert/strict";
import {
  tgaRows,
  repoRows,
  yieldDeltaBp,
  commonDate,
  calendarWindow,
} from "../lib/desk-analytics.js";
import { collectQuotes, collectProjects } from "../api/_desk-data.js";
test("Daily TGA closing record uses modern closing-balance field, without turning null into zero", () => {
  assert.deepEqual(
    tgaRows({
      data: [
        {
          record_date: "2026-10-09",
          account_type: "Treasury General Account (TGA) Closing Balance",
          open_today_bal: "872526",
          close_today_bal: "null",
        },
        {
          record_date: "2026-10-10",
          account_type: "Treasury General Account (TGA) Closing Balance",
          open_today_bal: "null",
        },
      ],
    }),
    [{ date: "2026-10-09", value: 872.526 }],
  );
  assert.throws(() => tgaRows({ meta: { total_pages: 2 }, data: [] }));
});
test("Repo daily aggregation deduplicates IDs and distinguishes zero from absence", () => {
  const op = (id, n) => ({
    operationId: id,
    operationType: "Repo",
    auctionStatus: "Results",
    operationDate: "2026-10-13",
    totalAmtAccepted: n,
    details: [{ amtAccepted: 5000000 }],
  });
  assert.deepEqual(
    repoRows({
      repo: {
        operations: [
          op("a", 1000000),
          op("a", 1000000),
          op("b", 2000000),
          { ...op("c", 0), operationDate: "2026-10-14" },
          op("d", null),
        ],
      },
    }),
    [
      { date: "2026-10-13", value: 0.003 },
      { date: "2026-10-14", value: 0 },
    ],
  );
});
test("Yield relative percentage changes convert to basis points", () => {
  assert.ok(Math.abs(yieldDeltaBp(5.04, 0.8) - 4) < 1e-10);
  assert.equal(yieldDeltaBp(null, -1), null);
});
test("Real and nominal comparison uses an actual common date", () => {
  assert.equal(
    commonDate([
      [{ date: "2026-10-12" }, { date: "2026-10-13" }],
      [{ date: "2026-10-12" }],
    ]),
    "2026-10-12",
  );
  assert.equal(commonDate([[], [{ date: "2026-10-12" }]]), null);
});
test("Public quote parser rejects wrong instrument metadata", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      data: [
        {
          s: "TVC:MOVE",
          d: ["Unrelated ETF", 100, 1, "streaming", "fund", 1791898200],
        },
      ],
    }),
  });
  try {
    const q = await collectQuotes();
    assert.ok(q.rows.find((x) => x.symbol === "TVC:MOVE").error);
  } finally {
    globalThis.fetch = old;
  }
});
test("Project parser retains dates on failure and rejects wrong token symbols", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (String(url).includes("/prices/current/"))
      return {
        ok: true,
        json: async () => ({
          coins: {
            "coingecko:solana": {
              symbol: "WRONG",
              price: 100,
              confidence: 0.99,
              timestamp: 123,
            },
          },
        }),
      };
    throw Error("Unavailable");
  };
  try {
    const p = await collectProjects({
      sources: {
        aster: { fetchedAt: "2026-10-01T00:00:00Z", value: { tvl: 10 } },
      },
    });
    assert.equal(p.sources.aster.fetchedAt, "2026-10-01T00:00:00Z");
    assert.ok(p.sources.aster.error);
    assert.equal(p.sources.prices.value.SOL, undefined);
  } finally {
    globalThis.fetch = old;
  }
});

test("STONK contract must match StonkFun, even when an impostor uses the same ticker", async () => {
  const old = globalThis.fetch;
  globalThis.fetch = async (url) => ({
    ok: true,
    json: async () =>
      String(url).includes("/protocol/stonkfun")
        ? { name: "Impostor", symbol: "STONK", address: "wrong" }
        : String(url).includes("/platform-token")
          ? { platformTokenMint: "wrong", priceUsd: 99 }
          : String(url).includes("/prices/current/")
            ? { coins: {} }
            : String(url).includes("/overview/")
              ? { protocols: [] }
              : [],
  });
  try {
    const p = await collectProjects();
    assert.ok(p.sources.stonk.error);
    assert.ok(p.sources.stonkMarket.error);
    assert.equal(p.sources.stonk.value, undefined);
  } finally {
    globalThis.fetch = old;
  }
});

test("Calendar window uses dates rather than observation counts and keeps gaps", () => {
  const rows = [
    { date: "2026-09-14", value: 1 },
    { date: "2026-09-15", value: 2 },
    { date: "2026-10-14", value: 3 },
  ];
  assert.deepEqual(calendarWindow(rows, 30), rows.slice(1));
  assert.deepEqual(calendarWindow(rows, "all"), rows);
  assert.deepEqual(calendarWindow([], 30), []);
  assert.deepEqual(calendarWindow(rows, "bad"), []);
});

test("Calendar charts keep the last published observation for each day", () => {
  assert.deepEqual(
    calendarWindow(
      [
        { date: "2026-10-14", value: 1 },
        { date: "2026-10-14", value: 2 },
      ],
      30,
    ),
    [{ date: "2026-10-14", value: 2 }],
  );
});
