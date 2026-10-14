import { csvSeries, day } from "../lib/analytics.js";
import { tgaRows, repoRows, finite } from "../lib/desk-analytics.js";
export const FRED_DESK = {
  DGS2: ["EE. UU. 2 años", "%"],
  DGS10: ["EE. UU. 10 años", "%"],
  DGS20: ["EE. UU. 20 años", "%"],
  DGS30: ["EE. UU. 30 años", "%"],
  DFII10: ["Tipo real 10 años", "%"],
  T10YIE: ["Compensación de inflación 10 años", "%"],
  VIXCLS: ["VIX · cierre", "puntos"],
  DCOILWTICO: ["WTI · spot", "USD/barril"],
  DCOILBRENTEU: ["Brent · spot", "USD/barril"],
};
export const QUOTES = [
  ["NASDAQ:TLT", "TLT", "USD", "iShares 20+"],
  ["TVC:US02Y", "EE. UU. 2 años", "%", "United States"],
  ["TVC:US10Y", "EE. UU. 10 años", "%", "United States"],
  ["TVC:US20Y", "EE. UU. 20 años", "%", "United States"],
  ["TVC:US30Y", "EE. UU. 30 años", "%", "United States"],
  ["FX:EURUSD", "EUR/USD", "USD/EUR", "Euro"],
  ["FX:USDJPY", "USD/JPY", "JPY/USD", "US Dollar"],
  ["TVC:MOVE", "MOVE", "puntos", "Volatility"],
  ["CBOE:VIX", "VIX", "puntos", "Volatility"],
];
async function json(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw Error("Fuente HTTP " + r.status);
  return r.json();
}
export async function collectQuotes() {
  const j = await json("https://scanner.tradingview.com/global/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      symbols: { tickers: QUOTES.map((q) => q[0]), query: { types: [] } },
      columns: [
        "description",
        "close",
        "change",
        "update_mode",
        "type",
        "time",
      ],
    }),
  });
  const rows = QUOTES.map(([symbol, name, unit, identity]) => {
    const d = j.data?.find((x) => x.s === symbol)?.d;
    if (!d || !String(d[0]).includes(identity) || finite(d[1]) === null)
      return {
        symbol,
        name,
        unit,
        error: "Cotización o identidad no disponible",
      };
    return {
      symbol,
      name,
      unit,
      description: d[0],
      value: finite(d[1]),
      change: finite(d[2]),
      mode: d[3],
      sessionAt: finite(d[5]) ? new Date(d[5] * 1000).toISOString() : null,
    };
  });
  return { fetchedAt: new Date().toISOString(), rows };
}
export async function collectDesk(previous = {}) {
  const end = day(Date.now()),
    start = day(Date.now() - 400 * 86400000),
    series = {};
  const tasks = Object.entries(FRED_DESK).map(([id, [name, unit]]) => [
    id,
    async () => {
      const u = new URL("https://fred.stlouisfed.org/graph/fredgraph.csv");
      u.search = new URLSearchParams({ id, cosd: start, coed: end });
      const r = await fetch(u, { signal: AbortSignal.timeout(45000) });
      if (!r.ok) throw Error("FRED no disponible");
      const rows = csvSeries(await r.text(), id);
      if (!rows.length) throw Error("Serie vacía");
      return {
        name,
        unit,
        rows,
        source: "FRED",
        url: `https://fred.stlouisfed.org/series/${id}`,
      };
    },
  ]);
  const tga = new URL(
    "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/v1/accounting/dts/operating_cash_balance",
  );
  tga.search = new URLSearchParams({
    fields: "record_date,account_type,open_today_bal,close_today_bal",
    filter: `account_type:eq:Treasury General Account (TGA) Closing Balance,record_date:gte:${start}`,
    sort: "record_date",
    "page[size]": "1000",
  });
  tasks.push([
    "TGA",
    async () => ({
      name: "TGA · cierre diario",
      unit: "miles de millones USD",
      rows: tgaRows(await json(tga)),
      source: "Tesoro de EE. UU.",
      url: "https://fiscaldata.treasury.gov/datasets/daily-treasury-statement/operating-cash-balance",
    }),
  ]);
  tasks.push([
    "REPO",
    async () => ({
      name: "Repos con la Fed · aceptado",
      unit: "miles de millones USD/día",
      rows: repoRows(
        await json(
          `https://markets.newyorkfed.org/api/rp/results/search.json?startDate=${start}&endDate=${end}&operationTypes=Repo`,
        ),
      ),
      source: "NY Fed",
      url: "https://www.newyorkfed.org/markets/desk-operations/repo",
    }),
  ]);
  await Promise.all(
    tasks.map(async ([id, run]) => {
      try {
        const v = await run();
        if (!v.rows?.length) throw Error("Sin observaciones");
        series[id] = { ...v, fetchedAt: new Date().toISOString() };
      } catch {
        series[id] = {
          ...previous.series?.[id],
          error: "Última consulta fallida",
        };
      }
    }),
  );
  let quotes;
  try {
    quotes = await collectQuotes();
  } catch {
    quotes = { ...previous.quotes, error: "Última consulta fallida" };
  }
  return { generatedAt: new Date().toISOString(), series, quotes };
}
export const STONK_MINT = "6GmAFSYs4gk3FDao5FzzySQpPZaWsa4rUJHacpMpUNgx";
export const PRICE_IDS = {
  STONK: "solana:" + STONK_MINT,
  USDT: "coingecko:tether",
  SOL: "coingecko:solana",
  ASTER: "bsc:0x000ae314e2a2172a039b26378814c252734f556a",
  PUMP: "solana:pumpCmXqMfrsAkQ5r49WcJnRayYRqmXz6ae8H7H9Dfn",
  PURR: "coingecko:purr-2",
};
export async function collectProjects(previous = {}) {
  const sources = {};
  const requests = {
    chains: "https://api.llama.fi/v2/chains",
    stablecoins: "https://stablecoins.llama.fi/stablecoinchains",
    aster: "https://api.llama.fi/protocol/aster",
    pump: "https://api.llama.fi/protocol/pump",
    stonk: "https://api.llama.fi/protocol/stonkfun",
    stonkDaily: "https://stonkfun.xyz/api/v2/revenue/daily?limit=90",
    stonkMarket: "https://stonkfun.xyz/api/v2/revenue/platform-token",
    stonkPools:
      "https://api.dexscreener.com/token-pairs/v1/solana/" + STONK_MINT,
    fees: "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
    revenue:
      "https://api.llama.fi/overview/fees?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true&dataType=dailyRevenue",
    volume:
      "https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
    prices: `https://coins.llama.fi/prices/current/${Object.values(PRICE_IDS).join(",")}`,
  };
  await Promise.all(
    Object.entries(requests).map(async ([key, url]) => {
      try {
        const raw = await json(url);
        let value;
        if (key === "chains")
          value = raw
            .filter((x) => ["Solana", "Hyperliquid L1"].includes(x.name))
            .map((x) => ({ name: x.name, tvl: finite(x.tvl) }));
        else if (key === "stablecoins")
          value = raw
            .filter((x) => ["Solana", "Hyperliquid L1"].includes(x.name))
            .map((x) => ({
              name: x.name,
              usd: Object.values(x.totalCirculatingUSD || {})
                .filter((x) => Number.isFinite(x))
                .reduce((a, b) => a + b, 0),
            }));
        else if (key === "stonk") {
          if (raw.symbol !== "STONK" || raw.address !== STONK_MINT)
            throw Error("Identidad STONK incorrecta");
          value = {
            name: raw.name,
            address: raw.address,
            symbol: raw.symbol,
            tvl: null,
          };
        } else if (key === "stonkDaily") {
          if (raw.network !== "mainnet-beta" || !Array.isArray(raw.days))
            throw Error("Histórico STONK inválido");
          value = {
            generatedAt: raw.generatedAt,
            rows: raw.days
              .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date))
              .map((x) => ({
                date: x.date,
                revenue: finite(x.revenueUsd),
                buybacks: finite(x.buybackUsd),
                burned: finite(x.stonkBurnedTokens),
              }))
              .sort((a, b) => a.date.localeCompare(b.date)),
          };
        } else if (key === "stonkMarket") {
          if (raw.platformTokenMint !== STONK_MINT)
            throw Error("Contrato STONK incorrecto");
          value = {
            mint: raw.platformTokenMint,
            price: finite(raw.priceUsd),
            marketCap: finite(raw.marketCapUsd),
            supply: finite(raw.supplyTokens),
            generatedAt: raw.generatedAt,
          };
        } else if (key === "stonkPools") {
          if (!Array.isArray(raw)) throw Error("Pools no disponibles");
          value = [
            ...new Map(
              raw
                .filter(
                  (p) =>
                    p.chainId === "solana" &&
                    p.baseToken?.address === STONK_MINT &&
                    finite(p.liquidity?.usd) !== null,
                )
                .map((p) => [
                  p.pairAddress,
                  {
                    pair: p.pairAddress,
                    dex: p.dexId,
                    quote: p.quoteToken?.symbol,
                    liquidity: finite(p.liquidity.usd),
                    volume24h: finite(p.volume?.h24),
                  },
                ]),
            ).values(),
          ]
            .sort((a, b) => b.liquidity - a.liquidity)
            .slice(0, 5);
        } else if (["aster", "pump"].includes(key)) {
          if (raw.symbol !== (key === "aster" ? "ASTER" : "PUMP"))
            throw Error("Identidad incorrecta");
          value = {
            name: raw.name,
            symbol: raw.symbol,
            address: raw.address,
            rows: (raw.tvl || []).slice(-100).map((x) => ({
              date: day(x.date * 1000),
              value: finite(x.totalLiquidityUSD),
            })),
            tvl: finite(raw.tvl?.at(-1)?.totalLiquidityUSD),
          };
        } else if (key === "prices") {
          value = {};
          for (const [symbol, id] of Object.entries(PRICE_IDS)) {
            const p = raw.coins?.[id];
            if (
              p?.symbol === symbol &&
              finite(p.price) > 0 &&
              p.confidence >= 0.8
            )
              value[symbol] = {
                price: p.price,
                timestamp: p.timestamp,
                confidence: p.confidence,
                id,
              };
          }
        } else {
          if (!Array.isArray(raw.protocols)) throw Error("Sin protocolos");
          value = raw.protocols
            .filter((x) =>
              [
                "aster-perps",
                "aster-spot",
                "pump.fun",
                "pumpswap",
                "stonkfun",
              ].includes(x.slug),
            )
            .map((x) => ({
              slug: x.slug,
              name: x.name,
              total24h: finite(x.total24h),
              total7d: finite(x.total7d),
              total30d: finite(x.total30d),
              change7d: finite(x.change_7dover7d),
              methodology: x.methodology,
              methodologyURL: x.methodologyURL,
            }));
        }
        sources[key] = { value, fetchedAt: new Date().toISOString(), url };
      } catch {
        sources[key] = {
          ...previous.sources?.[key],
          error: "Última consulta fallida",
        };
      }
    }),
  );
  return { generatedAt: new Date().toISOString(), sources };
}
