import { test } from "node:test";
import assert from "node:assert/strict";
import {
  csvSeries,
  atDate,
  pearson,
  correlations,
  liquidity,
  riskPosition,
  nextPublicationDate,
  staleSofr,
  backtest,
  day,
  hypothesis,
} from "../lib/analytics.js";
test("missing FRED values never become zero", () => {
  assert.deepEqual(
    csvSeries(
      "observation_date,IORB\n2026-10-01,.\n2026-10-02,\n2026-10-03,3.9",
      "IORB",
    ),
    [{ date: "2026-10-03", value: 3.9 }],
  );
});
test("historical values never use future rates", () => {
  assert.equal(
    atDate([{ date: "2026-10-05", value: 3.9 }], "2026-10-04"),
    null,
  );
});
test("spread is in basis points with correct liquidity interpretation", () => {
  assert.equal(liquidity(8).tone, "warn");
  assert.equal(liquidity(-3).label, "Diferencial contenido");
  assert.equal(liquidity(null).label, "Sin datos");
});
test("Pearson requires equal samples and returns null for constant data", () => {
  assert.equal(pearson([1, 2, 3], [3, 2, 1]), -1);
  assert.equal(pearson([1, 1, 1], [1, 2, 3]), null);
  assert.equal(pearson([1, 2, 3], [1, 2]), null);
});
test("correlations count actual SOFR observations, not weekends", () => {
  const candles = Array.from({ length: 10 }, (_, i) => ({
    date: day(Date.UTC(2026, 9, 1 + i)),
    c: 100 + i,
  }));
  const sofr = [
    { date: "2026-10-02", value: 3.8 },
    { date: "2026-10-05", value: 3.9 },
  ];
  const c = correlations(
    candles,
    sofr,
    [{ date: "2026-10-01", value: 3.9 }],
    7,
  );
  assert.equal(c.n, 2);
  assert.equal(c.value, null);
});
test("publication respects Columbus Day, Veterans Day and Good Friday", () => {
  assert.equal(nextPublicationDate("2026-10-09"), "2026-10-13");
  assert.equal(nextPublicationDate("2026-11-10"), "2026-11-12");
  assert.equal(nextPublicationDate("2026-04-02"), "2026-04-06");
  assert.equal(
    staleSofr("2026-10-09", new Date("2026-10-13T13:00:00Z")),
    false,
  );
  assert.equal(staleSofr("2026-10-09", new Date("2026-10-14T15:00:00Z")), true);
});
test("risk sizing includes commission within risk budget", () => {
  const p = riskPosition({
    side: "LONG",
    equity: 1000,
    risk: 1,
    leverage: 2,
    entry: 100,
    stop: 95,
    target: 110,
    fees: 12,
    mmr: 0.5,
    extra: 0,
  });
  assert.ok(!p.error);
  assert.ok(Math.abs(p.qty * 5 + p.feeCost - 10) < 1e-8);
  assert.ok(p.rr < 2);
  assert.ok(p.liq < 95);
});
test("direction is selected explicitly and incompatible stops are rejected", () => {
  const p = {
    equity: 1000,
    risk: 1,
    leverage: 2,
    entry: 100,
    stop: 95,
    target: 110,
    fees: 12,
    mmr: 0.5,
    extra: 0,
  };
  assert.ok(riskPosition({ ...p, side: "" }).error);
  assert.ok(riskPosition({ ...p, side: "SHORT" }).error);
  assert.ok(riskPosition({ ...p, side: "LONG", mmr: 60 }).error);
});
test("warns when liquidation comes before stop", () => {
  const p = riskPosition({
    side: "LONG",
    equity: 1000,
    risk: 1,
    leverage: 100,
    entry: 100,
    stop: 95,
    target: 110,
    fees: 12,
    mmr: 0.5,
    extra: 0,
  });
  assert.ok(p.warnings.some((w) => w.includes("antes del stop")));
});
test("hypothesis requires 8 observations and meaningful movement", () => {
  assert.equal(hypothesis([]).side, "NEUTRAL");
  assert.equal(
    hypothesis(Array.from({ length: 8 }, (_, i) => ({ value: -1 - i / 10 })))
      .side,
    "LONG",
  );
  assert.equal(
    hypothesis(Array.from({ length: 8 }, () => ({ value: -3 }))).side,
    "NEUTRAL",
  );
});
test("backtest cannot use future rate observations; fees reduce returns", () => {
  const candles = Array.from({ length: 100 }, (_, i) => ({
    date: day(Date.UTC(2026, 5, 1 + i)),
    o: 100 + i,
    h: 102 + i,
    l: 98 + i,
    c: 101 + i,
  }));
  const sofr = candles
    .filter((c) => ![0, 6].includes(new Date(c.date).getUTCDay()))
    .map((c, i) => ({ date: c.date, value: 3.9 - (i % 8) * 0.002 }));
  const iorb = [{ date: "2026-05-01", value: 3.9 }];
  const a = backtest(candles, sofr, iorb, { fees: 0 }),
    b = backtest(candles, sofr, iorb, { fees: 12 });
  assert.ok(a.trades.length > 0);
  assert.equal(a.trades.length, b.trades.length);
  assert.ok(b.expectancy < a.expectancy);
  for (let n = 25; n < 70; n += 10) {
    const cutoff = candles[n].date,
      prefix = backtest(candles.slice(0, n + 1), sofr, iorb);
    assert.ok(prefix.trades.every((t) => t.exitDate <= cutoff));
    assert.deepEqual(
      prefix.trades.filter((t) => t.reason !== "7 días"),
      backtest(
        candles.slice(0, n + 1),
        sofr.filter((r) => r.date <= cutoff),
        iorb,
      ).trades.filter((t) => t.reason !== "7 días"),
    );
  }
});
