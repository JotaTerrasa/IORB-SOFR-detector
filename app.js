/* IORB × SOFR × BTC — client-side dashboard
   - BTC data: CoinGecko (no key)
   - IORB/SOFR: manual inputs OR FRED (optional key)
   - Correlation: Pearson between BTC daily returns and spread (SOFR - IORB)
*/

const APP_VERSION = "20260114_7";
const CG_BASE = "https://api.coingecko.com/api/v3";
const NYFED_SOFR_LAST = "https://markets.newyorkfed.org/api/rates/secured/sofr/last/1.json";
const NYFED_SOFR_SEARCH = "https://markets.newyorkfed.org/api/rates/secured/sofr/search.json";
const FRED_GRAPH_CSV = "https://fred.stlouisfed.org/graph/fredgraph.csv";
const ALLORIGINS_RAW = "https://api.allorigins.win/raw?url=";

const LS = {
  fredKey: "iorbsofr:friedKey", // legacy (no longer used)
  fredKey2: "iorbsofr:fredKey", // legacy (no longer used)
  manualIorb: "iorbsofr:manualIorb",
  manualSofr: "iorbsofr:manualSofr",
  iorbSchedule: "iorbsofr:iorbSchedule",
  sound: "iorbsofr:sound",
  explain: "iorbsofr:explain",
  rangeDays: "iorbsofr:rangeDays",
  history: "iorbsofr:history",
  lastSignal: "iorbsofr:lastSignal",
  lastDailyRefresh: "iorbsofr:lastDailyRefresh",
  parityBps: "iorbsofr:parityBps",
  levelsInput: "iorbsofr:levelsInput",
  equityUsd: "iorbsofr:equityUsd",
  riskPct: "iorbsofr:riskPct",
  leverage: "iorbsofr:leverage",
  mmrPct: "iorbsofr:mmrPct",
  marginExtraUsd: "iorbsofr:marginExtraUsd",
  feeBps: "iorbsofr:feeBps",
  alerts: "iorbsofr:alerts",
  lastPlanHash: "iorbsofr:lastPlanHash",
  lastOkDataset: "iorbsofr:lastOkDataset",
  details: "iorbsofr:details",
  journal: "iorbsofr:journal",
  lastPrice: "iorbsofr:lastPrice",
  lastInParity: "iorbsofr:lastInParity",
  lastAlertKey: "iorbsofr:lastAlertKey",
  lastAlertAt: "iorbsofr:lastAlertAt",
};

function coolDownOk(ms) {
  const last = Number(localStorage.getItem(LS.lastAlertAt) || "0");
  return !Number.isFinite(last) || Date.now() - last >= ms;
}

function fireAlert(message) {
  const alertsOn = localStorage.getItem(LS.alerts) === "1";
  if (!alertsOn) return;
  if (!coolDownOk(12_000)) return; // global cooldown
  localStorage.setItem(LS.lastAlertAt, String(Date.now()));

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("IORB/SOFR BTC", { body: message });
    } catch {}
  }
  maybeBeepOnSignalChange("ALERT");
}

const $ = (id) => document.getElementById(id);
const fmtMoney = (n) =>
  n == null || Number.isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (n, digits = 2) =>
  n == null || Number.isNaN(n) ? "—" : `${n.toFixed(digits)}%`;
const fmtNum = (n, digits = 3) => (n == null || Number.isNaN(n) ? "—" : n.toFixed(digits));
const fmtUsd = (n, digits = 2) =>
  n == null || Number.isNaN(n)
    ? "—"
    : n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

function clamp(x, a, b) {
  return Math.max(a, Math.min(b, x));
}

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function nowIsoShort() {
  const d = new Date();
  return d.toISOString().replace("T", " ").slice(0, 19) + "Z";
}

function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  let sx = 0,
    sy = 0,
    sxx = 0,
    syy = 0,
    sxy = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i];
    const yi = y[i];
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) return null;
    sx += xi;
    sy += yi;
    sxx += xi * xi;
    syy += yi * yi;
    sxy += xi * yi;
  }
  const cov = sxy - (sx * sy) / n;
  const vx = sxx - (sx * sx) / n;
  const vy = syy - (sy * sy) / n;
  if (vx <= 0 || vy <= 0) return null;
  return cov / Math.sqrt(vx * vy);
}

function pctReturns(prices) {
  // prices: [{t, v}] sorted by time
  const r = [];
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1].v;
    const b = prices[i].v;
    if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0) return null;
    r.push((b - a) / a);
  }
  return r;
}

function pct(n, digits = 2) {
  return n == null || Number.isNaN(n) ? "—" : `${(n * 100).toFixed(digits)}%`;
}

function liqPriceApprox({ side, entry, leverage, mmr, qtyBtc, extraMarginUsd }) {
  // Linear USDT perpetual approximation. Not exchange-accurate.
  if (!Number.isFinite(entry) || !Number.isFinite(leverage) || leverage <= 0) return null;
  const m = Number.isFinite(mmr) ? mmr : 0.005;
  const q = Number.isFinite(qtyBtc) && qtyBtc > 0 ? qtyBtc : null;
  const extra = Number.isFinite(extraMarginUsd) ? extraMarginUsd : 0;
  if (side === "LONG") {
    if (!q || extra <= 0) return (entry * (1 - 1 / leverage)) / (1 - m);
    // With extra margin: P = (q*entry*(1-1/lev) - extra) / (q*(1-m))
    return (q * entry * (1 - 1 / leverage) - extra) / (q * (1 - m));
  }
  if (side === "SHORT") {
    if (!q || extra <= 0) return (entry * (1 + 1 / leverage)) / (1 + m);
    // With extra margin: P = (q*entry*(1+1/lev) + extra) / (q*(1+m))
    return (q * entry * (1 + 1 / leverage) + extra) / (q * (1 + m));
  }
  return null;
}

function calcRiskToolkit({ side, equityUsd, riskPct, leverage, mmrPct, marginExtraUsd, feeBps, entry, stop, target }) {
  if (!Number.isFinite(equityUsd) || equityUsd <= 0) return { ok: false, msg: "Pon tu equity (USDT)." };
  const rPct = Number.isFinite(riskPct) ? riskPct : 0.5;
  const riskUsd = equityUsd * (rPct / 100);
  if (!Number.isFinite(entry) || entry <= 0) return { ok: false, msg: "Entry inválido." };
  if (!Number.isFinite(stop) || stop <= 0) return { ok: false, msg: "Stop inválido." };
  const stopDist = Math.abs(entry - stop);
  if (stopDist <= 0) return { ok: false, msg: "Stop igual al entry." };
  // Position size in BTC to risk 'riskUsd' for a move of stopDist USD per BTC
  const qtyBtc = riskUsd / stopDist;
  const notional = qtyBtc * entry;
  const lev = Number.isFinite(leverage) && leverage > 0 ? leverage : 10;
  const margin = notional / lev;
  const mmr = (Number.isFinite(mmrPct) ? mmrPct : 0.5) / 100;
  const extra = Number.isFinite(marginExtraUsd) ? marginExtraUsd : 0;
  const liq = liqPriceApprox({ side, entry, leverage: lev, mmr, qtyBtc, extraMarginUsd: extra });
  const rr = Number.isFinite(target) ? Math.abs(target - entry) / stopDist : null;
  const bps = Number.isFinite(feeBps) ? feeBps : 12;
  const feeRate = bps / 10000;
  const feeCost = notional * feeRate;
  const effectiveRiskUsd = riskUsd + feeCost;
  return { ok: true, riskUsd, effectiveRiskUsd, feeCost, feeRate, qtyBtc, notional, margin, liq, rr, lev, mmr, extra };
}

function rollingPearson({ x, y, window }) {
  const out = Array.from({ length: x.length }, () => null);
  for (let i = window - 1; i < x.length; i++) {
    out[i] = pearson(x.slice(i - window + 1, i + 1), y.slice(i - window + 1, i + 1));
  }
  return out;
}

function trendFromSeries(series) {
  if (!series || series.length < 3) return { label: "—", slope: null };
  // Simple slope via endpoints (stable and fast)
  const a = series[0];
  const b = series[series.length - 1];
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { label: "—", slope: null };
  const slope = (b - a) / Math.max(1, series.length - 1);
  const eps = 1e-6;
  const label = slope > eps ? "Subiendo" : slope < -eps ? "Bajando" : "Plano";
  return { label, slope };
}

function confidenceLabel({ signal, inParity, d7, parityTh, corr30, atrNow, priceNow }) {
  // Intuitive confidence scoring for futures:
  // - In parity (trade-allowed regime)
  // - Spread has meaningful movement vs parity band
  // - ATR exists (volatility estimate for stops)
  // - corr30 exists (extra context)
  let pts = 0;
  if (inParity) pts += 1;
  if (Number.isFinite(d7) && Number.isFinite(parityTh) && Math.abs(d7) >= parityTh * 0.5) pts += 1;
  if (Number.isFinite(atrNow) && Number.isFinite(priceNow) && atrNow > 0 && priceNow > 0) pts += 1;
  if (corr30 != null) pts += 1;
  // If there's no directional trigger, cap confidence so "ESPERAR" never shows as ALTA.
  if (signal === "NEUTRAL") return pts >= 3 ? "MEDIA" : "BAJA";
  if (pts >= 3) return "ALTA";
  if (pts === 2) return "MEDIA";
  return "BAJA";
}

function decideSignal({ iorb, sofr, corr30, spreadTrend }) {
  const spread = sofr - iorb;
  if (corr30 == null) {
    return {
      signal: "NEUTRAL",
      explanation:
        `Spread actual = SOFR − IORB = ${fmtPct(spread, 3)}. ` +
        "Falta correlación 30d (histórico insuficiente) → NEUTRAL.",
    };
  }
  const corr = corr30;
  const isLong = sofr > iorb && corr > 0;
  const isShort = sofr < iorb && corr < 0;
  const signal = isLong ? "LONG" : isShort ? "SHORT" : "NEUTRAL";

  const parts = [];
  parts.push(`Spread actual = SOFR − IORB = ${fmtPct(spread, 3)}.`);
  parts.push(`Correlación 30d (retornos BTC vs spread) = ${fmtNum(corr, 3)}.`);
  if (spreadTrend?.label && spreadTrend.label !== "—") parts.push(`Tendencia spread: ${spreadTrend.label}.`);

  if (signal === "LONG") {
    parts.push(
      "Regla activada: SOFR > IORB y correlación positiva → interpretación risk-on / liquidez relativamente holgada → sesgo bullish."
    );
  } else if (signal === "SHORT") {
    parts.push(
      "Regla activada: SOFR < IORB y correlación negativa → interpretación risk-off / stress de liquidez → sesgo bearish."
    );
  } else {
    parts.push("No se cumple una regla fuerte → NEUTRAL (esperar confirmación).");
  }

  return { signal, explanation: parts.join(" ") };
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt.slice(0, 120)}`);
  }
  return res.json();
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { accept: "text/plain,*/*" } });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${txt.slice(0, 120)}`);
  }
  return res.text();
}

function viaAllOrigins(url) {
  return `${ALLORIGINS_RAW}${encodeURIComponent(url)}`;
}

async function fetchNybSofrLatest() {
  const data = await fetchJson(NYFED_SOFR_LAST);
  const rr = data?.refRates?.[0];
  const v = rr?.percentRate;
  const n = Number(v);
  return { value: Number.isFinite(n) ? n : null, date: rr?.effectiveDate || null };
}

async function fetchNybSofrSeries({ startDate, endDate }) {
  const url = `${NYFED_SOFR_SEARCH}?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
  const data = await fetchJson(url);
  const rows = (data?.refRates ?? [])
    .map((r) => ({ date: r?.effectiveDate, value: Number(r?.percentRate) }))
    .filter((r) => typeof r.date === "string" && Number.isFinite(r.value));
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return rows;
}

function parseFredGraphCsv(csvText, valueColumnName) {
  // format:
  // observation_date,IORB
  // 2021-07-29,0.15
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const dateIdx = header.indexOf("observation_date");
  const valIdx = header.indexOf(valueColumnName);
  if (dateIdx === -1 || valIdx === -1) return [];
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const d = cols[dateIdx];
    const v = cols[valIdx];
    if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const n = Number(String(v).trim());
    if (!Number.isFinite(n)) continue;
    out.push({ date: d, value: n });
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return out;
}

async function fetchIorbSeriesFromFredCsv({ startDate, endDate }) {
  const url = `${FRED_GRAPH_CSV}?id=IORB&cosd=${encodeURIComponent(startDate)}&coed=${encodeURIComponent(endDate)}`;
  try {
    const csv = await fetchText(url);
    return { series: parseFredGraphCsv(csv, "IORB"), source: "FRED CSV" };
  } catch (e) {
    // Likely CORS in browser; retry through a simple CORS proxy.
    const csv = await fetchText(viaAllOrigins(url));
    return { series: parseFredGraphCsv(csv, "IORB"), source: "FRED CSV (proxy)" };
  }
}

async function fetchIorbLatestFromFredCsv() {
  // Small window to improve reliability (and speed) vs fetching full series.
  const end = isoDate(new Date());
  const start = new Date(end + "T00:00:00Z");
  start.setUTCDate(start.getUTCDate() - 45);
  const startDate = isoDate(start);
  const { series, source } = await fetchIorbSeriesFromFredCsv({ startDate, endDate: end });
  const last = series.length ? series[series.length - 1] : null;
  if (!last) return { value: null, date: null, source };
  return { value: last.value, date: last.date, source };
}

async function fetchBtcMarket() {
  const url =
    `${CG_BASE}/coins/markets?vs_currency=usd&ids=bitcoin&order=market_cap_desc&per_page=1&page=1&sparkline=false&price_change_percentage=24h`;
  const [row] = await fetchJson(url);
  return {
    price: row?.current_price ?? null,
    change24h: row?.price_change_percentage_24h ?? null,
  };
}

async function fetchBtcDailyPrices(days) {
  const url = `${CG_BASE}/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`;
  const data = await fetchJson(url);
  const prices = (data?.prices ?? [])
    .map(([t, v]) => ({ t: new Date(t), v }))
    .filter((p) => Number.isFinite(p.v));
  prices.sort((a, b) => a.t - b.t);
  // de-dup by date (keep last)
  const byDay = new Map();
  for (const p of prices) {
    const k = isoDate(p.t);
    byDay.set(k, p);
  }
  return Array.from(byDay.values()).sort((a, b) => a.t - b.t);
}

function alignDailyForwardFill({ labels, series, fallbackValue }) {
  // labels: ["YYYY-MM-DD", ...] ascending
  // series: [{date:"YYYY-MM-DD", value:number}] ascending, possibly sparse
  const out = [];
  let j = 0;
  let last = null;
  for (let i = 0; i < labels.length; i++) {
    const d = labels[i];
    while (j < series.length && series[j].date <= d) {
      last = series[j].value;
      j++;
    }
    out.push(last == null ? fallbackValue : last);
  }
  return out;
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(LS.history);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveHistory(items) {
  localStorage.setItem(LS.history, JSON.stringify(items.slice(0, 50)));
}

function pushHistory(entry) {
  const items = loadHistory();
  items.unshift(entry);
  saveHistory(items);
}

function renderHistory() {
  const list = $("historyList");
  const items = loadHistory();
  if (!items.length) {
    list.innerHTML = `<div class="card__sub">Sin historial aún.</div>`;
    return;
  }
  list.innerHTML = items
    .map((it) => {
      const cls =
        it.signal === "LONG" ? "is-green" : it.signal === "SHORT" ? "is-red" : "is-amber";
      const badge =
        it.strength === "FUERTE" ? "FUERTE" : it.strength === "MEDIA" ? "MEDIA" : "DÉBIL";
      return `
        <div class="history-item">
          <div class="history-item__left">
            <div class="history-item__sig ${cls}">${it.signal}</div>
            <div class="history-item__meta">${it.when} · spread ${it.spreadPct} · corr30 ${it.corr30}</div>
          </div>
          <div class="history-item__badge">${badge}</div>
        </div>
      `;
    })
    .join("");
}

function loadJournal() {
  try {
    const raw = localStorage.getItem(LS.journal);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveJournal(items) {
  localStorage.setItem(LS.journal, JSON.stringify(items.slice(0, 200)));
}

function journalStats(items) {
  const marked = items.filter((t) => t.outcome === "win" || t.outcome === "loss");
  const n = marked.length;
  if (!n) return { n: items.length, winrate: null, expR: null };
  const wins = marked.filter((t) => t.outcome === "win").length;
  const winrate = wins / n;
  const expR = marked.reduce((s, t) => s + (Number.isFinite(t.r) ? t.r : 0), 0) / n;
  return { n: items.length, winrate, expR };
}

function renderJournal() {
  const list = $("journalList");
  if (!list) return;
  const items = loadJournal();
  const st = journalStats(items);
  $("jrTrades") && ($("jrTrades").textContent = String(st.n));
  $("jrWinrate") && ($("jrWinrate").textContent = st.winrate == null ? "—" : pct(st.winrate, 1));
  $("jrExpR") && ($("jrExpR").textContent = st.expR == null ? "—" : fmtNum(st.expR, 2));

  if (!items.length) {
    list.innerHTML = `<div class="card__sub">Sin journal aún.</div>`;
    return;
  }

  list.innerHTML = items
    .map((t) => {
      const cls = t.side === "LONG" ? "is-green" : t.side === "SHORT" ? "is-red" : "is-amber";
      const outcome =
        t.outcome === "win"
          ? `<span class="history-item__badge is-green">WIN</span>`
          : t.outcome === "loss"
            ? `<span class="history-item__badge is-red">LOSS</span>`
            : `<span class="history-item__badge">—</span>`;
      return `
        <div class="history-item" data-jid="${t.id}">
          <div class="history-item__left">
            <div class="history-item__sig ${cls}">${t.side}</div>
            <div class="history-item__meta">
              ${t.when} · entry ${t.entry} · stop ${t.stop} · tp ${t.target} · qty ${t.qtyBtc} · RR ${t.rr}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; justify-content:flex-end;">
            ${outcome}
            <button class="btn btn--ghost" data-act="win" type="button">Win</button>
            <button class="btn btn--ghost" data-act="loss" type="button">Loss</button>
            <button class="btn btn--ghost" data-act="del" type="button">Del</button>
          </div>
        </div>
      `;
    })
    .join("");
}

function setStatus(kind, text) {
  const dot = $("statusDot");
  const label = $("statusText");
  label.textContent = text;
  dot.style.background =
    kind === "ok" ? "var(--green)" : kind === "warn" ? "var(--amber)" : kind === "err" ? "var(--red)" : "var(--cyan)";
  dot.style.boxShadow =
    kind === "ok"
      ? "0 0 10px rgba(57,255,136,.55)"
      : kind === "warn"
        ? "0 0 10px rgba(255,204,102,.45)"
        : kind === "err"
          ? "0 0 10px rgba(255,55,107,.55)"
          : "0 0 10px rgba(0,255,213,.55)";
}

function setSignalUI({ signal, strength, sub, explanation }) {
  const card = $("signalCard");
  const sText = $("signalText");
  const sSub = $("signalSub");
  const sExp = $("signalExplain");
  const sStrength = $("signalStrength");

  const cls =
    signal === "LONG" ? "is-green" : signal === "SHORT" ? "is-red" : "is-amber";
  sText.className = `signal ${cls} pulse`;
  sText.textContent = signal === "NEUTRAL" ? "ESPERAR" : signal;
  sSub.textContent = sub;

  const explainOn = $("explainToggle").checked;
  sExp.style.display = explainOn ? "block" : "none";
  sExp.textContent = explanation || "—";

  sStrength.textContent = strength || "—";
  sStrength.className =
    strength === "ALTA" ? "is-green" : strength === "MEDIA" ? "is-cyan" : "is-amber";

  // tint the card border a bit
  if (signal === "LONG") {
    card.style.borderColor = "rgba(57,255,136,.35)";
    card.style.boxShadow = "var(--shadow), var(--glowG)";
  } else if (signal === "SHORT") {
    card.style.borderColor = "rgba(255,55,107,.35)";
    card.style.boxShadow = "var(--shadow), var(--glowR)";
  } else {
    card.style.borderColor = "rgba(255,204,102,.22)";
    card.style.boxShadow = "var(--shadow)";
  }
}

let chart = null;
let auxChart = null;

function buildChart({ labels, btc, iorb, sofr }) {
  const ctx = $("mainChart").getContext("2d");
  if (chart) chart.destroy();
  chart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "BTC (USD)",
          data: btc,
          yAxisID: "yBtc",
          borderColor: "rgba(0,255,213,.95)",
          backgroundColor: "rgba(0,255,213,.12)",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "IORB (%)",
          data: iorb,
          yAxisID: "yRate",
          borderColor: "rgba(88,244,255,.90)",
          backgroundColor: "rgba(88,244,255,.10)",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "SOFR (%)",
          data: sofr,
          yAxisID: "yRate",
          borderColor: "rgba(57,255,136,.85)",
          backgroundColor: "rgba(57,255,136,.10)",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "rgba(234,241,255,.75)" } },
        tooltip: {
          backgroundColor: "rgba(10,14,22,.95)",
          borderColor: "rgba(0,255,213,.22)",
          borderWidth: 1,
          titleColor: "rgba(234,241,255,.92)",
          bodyColor: "rgba(234,241,255,.82)",
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(234,241,255,.55)", maxRotation: 0, autoSkip: true },
          grid: { color: "rgba(234,241,255,.06)" },
        },
        yBtc: {
          position: "left",
          ticks: {
            color: "rgba(234,241,255,.55)",
            callback: (v) => {
              try {
                return Number(v).toLocaleString(undefined, { notation: "compact" });
              } catch {
                return v;
              }
            },
          },
          grid: { color: "rgba(234,241,255,.06)" },
        },
        yRate: {
          position: "right",
          ticks: { color: "rgba(234,241,255,.55)", callback: (v) => `${v}%` },
          grid: { drawOnChartArea: false, color: "rgba(234,241,255,.06)" },
        },
      },
    },
  });
}

function buildAuxChart({ labels, spread, rollingCorr30 }) {
  const canvas = $("auxChart");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (auxChart) auxChart.destroy();
  auxChart = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Spread (SOFR − IORB) %",
          data: spread,
          yAxisID: "ySpread",
          borderColor: "rgba(255,204,102,.90)",
          backgroundColor: "rgba(255,204,102,.10)",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
        },
        {
          label: "Rolling corr30",
          data: rollingCorr30,
          yAxisID: "yCorr",
          borderColor: "rgba(0,255,213,.90)",
          backgroundColor: "rgba(0,255,213,.10)",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
          spanGaps: true,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { labels: { color: "rgba(234,241,255,.75)" } },
        tooltip: {
          backgroundColor: "rgba(10,14,22,.95)",
          borderColor: "rgba(0,255,213,.22)",
          borderWidth: 1,
          titleColor: "rgba(234,241,255,.92)",
          bodyColor: "rgba(234,241,255,.82)",
        },
      },
      scales: {
        x: {
          ticks: { color: "rgba(234,241,255,.55)", maxRotation: 0, autoSkip: true },
          grid: { color: "rgba(234,241,255,.06)" },
        },
        ySpread: {
          position: "left",
          ticks: { color: "rgba(234,241,255,.55)", callback: (v) => `${v}%` },
          grid: { color: "rgba(234,241,255,.06)" },
        },
        yCorr: {
          position: "right",
          min: -1,
          max: 1,
          ticks: { color: "rgba(234,241,255,.55)" },
          grid: { drawOnChartArea: false, color: "rgba(234,241,255,.06)" },
        },
      },
    },
  });
}

function animateNumber(el, targetText) {
  // Very light "tick" illusion: swap text with small fade
  el.style.transition = "opacity .08s ease";
  el.style.opacity = "0.4";
  setTimeout(() => {
    el.textContent = targetText;
    el.style.opacity = "1";
  }, 90);
}

function safeNumFromInput(v) {
  if (v == null) return null;
  const raw = String(v).replace(",", ".").trim();
  if (raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

async function fetchBtcOhlc(days) {
  // returns [{date:"YYYY-MM-DD", t:Date, o,h,l,c}]
  const url = `${CG_BASE}/coins/bitcoin/ohlc?vs_currency=usd&days=${days}`;
  const data = await fetchJson(url);
  const rows = (data ?? [])
    .map(([t, o, h, l, c]) => ({ t: new Date(t), o, h, l, c }))
    .filter((r) => [r.o, r.h, r.l, r.c].every(Number.isFinite));
  rows.sort((a, b) => a.t - b.t);
  // de-dup by date (keep last)
  const byDay = new Map();
  for (const r of rows) byDay.set(isoDate(r.t), r);
  return Array.from(byDay.entries())
    .map(([date, r]) => ({ date, ...r }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

function atr14(ohlc) {
  // ohlc: [{c,h,l}] chronological
  const tr = [];
  for (let i = 1; i < ohlc.length; i++) {
    const prevC = ohlc[i - 1].c;
    const hi = ohlc[i].h;
    const lo = ohlc[i].l;
    tr.push(Math.max(hi - lo, Math.abs(hi - prevC), Math.abs(lo - prevC)));
  }
  const out = Array.from({ length: ohlc.length }, () => null);
  for (let i = 14; i < ohlc.length; i++) {
    const slice = tr.slice(i - 14, i); // 14 values
    const s = slice.reduce((a, b) => a + b, 0);
    out[i] = s / 14;
  }
  return out;
}

function backtestParityStrategy({ labels, ohlc, spreadDaily, corr30Series, parityBps }) {
  // Strategy:
  // - Only trade when |spread| <= parityBps (bps) and corr30 exists
  // - Direction: spreadChange7 < 0 => LONG (improving liquidity), >0 => SHORT
  // - Risk: stop = 1.5 * ATR14, TP = 2R, max hold = 7 days
  const bps = parityBps ?? 5;
  const parityTh = bps / 100.0; // bps -> percentage points
  const atr = atr14(ohlc);
  const atrMult = 1.5;
  const tpR = 2.0;
  const maxHold = 7;

  const trades = [];
  for (let i = 20; i < labels.length - 2; i++) {
    const spread = spreadDaily[i];
    const corr30 = corr30Series[i];
    if (!Number.isFinite(spread) || corr30 == null) continue;
    if (Math.abs(spread) > parityTh) continue;
    if (i < 7) continue;
    const dSpread7 = spreadDaily[i] - spreadDaily[i - 7];
    const dir = dSpread7 < 0 ? 1 : dSpread7 > 0 ? -1 : 0;
    if (dir === 0) continue;
    const a = atr[i];
    if (!Number.isFinite(a) || a <= 0) continue;

    const entry = ohlc[i].c;
    const risk = atrMult * a;
    const stop = dir === 1 ? entry - risk : entry + risk;
    const target = dir === 1 ? entry + risk * tpR : entry - risk * tpR;

    let exitIdx = null;
    let rMult = null;
    for (let j = i + 1; j <= Math.min(i + maxHold, labels.length - 1); j++) {
      const hi = ohlc[j].h;
      const lo = ohlc[j].l;
      const hitStop = dir === 1 ? lo <= stop : hi >= stop;
      const hitTarget = dir === 1 ? hi >= target : lo <= target;
      if (hitStop && hitTarget) {
        // conservative: assume stop first
        exitIdx = j;
        rMult = -1;
        break;
      }
      if (hitStop) {
        exitIdx = j;
        rMult = -1;
        break;
      }
      if (hitTarget) {
        exitIdx = j;
        rMult = tpR;
        break;
      }
    }
    if (exitIdx == null) {
      exitIdx = Math.min(i + maxHold, labels.length - 1);
      const exit = ohlc[exitIdx].c;
      rMult = dir === 1 ? (exit - entry) / risk : (entry - exit) / risk;
    }
    trades.push({ i, exitIdx, rMult });
    i = exitIdx; // no overlapping trades
  }

  const n = trades.length;
  if (!n) return { n: 0, winrate: null, expR: null, note: "Sin trades en la ventana." };
  const wins = trades.filter((t) => t.rMult > 0).length;
  const winrate = wins / n;
  const expR = trades.reduce((s, t) => s + t.rMult, 0) / n;
  return {
    n,
    winrate,
    expR,
    note: `Paridad: ±${bps} bps · ATR14 stop 1.5x · TP 2R · max hold 7d · trades no solapados.`,
  };
}

function getFedStateFromUI() {
  const iorbManual = safeNumFromInput($("manualIorb").value);
  const sofrManual = safeNumFromInput($("manualSofr").value);
  const iorbSchedule = ($("iorbSchedule")?.value ?? "").trim();
  const parityBps = safeNumFromInput($("parityBps")?.value ?? "");
  const levelsInput = ($("levelsInput")?.value ?? "").trim();
  return { iorbManual, sofrManual, iorbSchedule, parityBps, levelsInput };
}

function persistFedState() {
  const { iorbManual, sofrManual, iorbSchedule, parityBps, levelsInput } = getFedStateFromUI();
  if (iorbManual != null) localStorage.setItem(LS.manualIorb, String(iorbManual));
  else localStorage.removeItem(LS.manualIorb);
  if (sofrManual != null) localStorage.setItem(LS.manualSofr, String(sofrManual));
  else localStorage.removeItem(LS.manualSofr);
  if (iorbSchedule) localStorage.setItem(LS.iorbSchedule, iorbSchedule);
  else localStorage.removeItem(LS.iorbSchedule);
  if (parityBps != null) localStorage.setItem(LS.parityBps, String(parityBps));
  if (levelsInput) localStorage.setItem(LS.levelsInput, levelsInput);
  else localStorage.removeItem(LS.levelsInput);
}

function restoreUIState() {
  // Migration: older versions treated "" as 0, which forced manual overrides.
  const savedIorbRaw = localStorage.getItem(LS.manualIorb) || "";
  const savedSofrRaw = localStorage.getItem(LS.manualSofr) || "";
  const savedIorb = savedIorbRaw === "0" ? "" : savedIorbRaw;
  const savedSofr = savedSofrRaw === "0" ? "" : savedSofrRaw;
  const savedSchedule = localStorage.getItem(LS.iorbSchedule) || "";
  const savedParity = localStorage.getItem(LS.parityBps) || "5";
  const savedLevels = localStorage.getItem(LS.levelsInput) || "";
  const savedEquity = localStorage.getItem(LS.equityUsd) || "";
  const savedRisk = localStorage.getItem(LS.riskPct) || "0.5";
  const savedLev = localStorage.getItem(LS.leverage) || "10";
  const savedMmr = localStorage.getItem(LS.mmrPct) || "0.5";
  const savedExtra = localStorage.getItem(LS.marginExtraUsd) || "0";
  const savedFees = localStorage.getItem(LS.feeBps) || "12";
  const savedAlerts = localStorage.getItem(LS.alerts) || "0";
  const savedDetails = localStorage.getItem(LS.details) || "0";
  const sound = localStorage.getItem(LS.sound);
  const explain = localStorage.getItem(LS.explain);
  const rangeDays = localStorage.getItem(LS.rangeDays) || "90";

  $("manualIorb").value = savedIorb;
  $("manualSofr").value = savedSofr;
  const sch = $("iorbSchedule");
  if (sch) sch.value = savedSchedule;
  const pb = $("parityBps");
  if (pb) pb.value = savedParity;
  const li = $("levelsInput");
  if (li) li.value = savedLevels;
  $("equityUsd") && ($("equityUsd").value = savedEquity);
  $("riskPct") && ($("riskPct").value = savedRisk);
  $("leverage") && ($("leverage").value = savedLev);
  $("mmrPct") && ($("mmrPct").value = savedMmr);
  $("marginExtraUsd") && ($("marginExtraUsd").value = savedExtra);
  $("feeBps") && ($("feeBps").value = savedFees);
  $("alertsToggle") && ($("alertsToggle").checked = savedAlerts === "1");
  $("soundToggle").checked = sound === "1";
  $("explainToggle").checked = explain !== "0";

  // default: hide details panels
  document.body.classList.toggle("show-details", savedDetails === "1");

  // segmented range
  document.querySelectorAll(".segmented__btn").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-range") === rangeDays);
  });
}

function setRangeDays(days) {
  localStorage.setItem(LS.rangeDays, String(days));
  document.querySelectorAll(".segmented__btn").forEach((b) => {
    b.classList.toggle("is-active", b.getAttribute("data-range") === String(days));
  });
}

function maybeBeepOnSignalChange(nextSignal) {
  const soundOn = $("soundToggle").checked;
  if (!soundOn) return;
  const prev = localStorage.getItem(LS.lastSignal) || "";
  if (prev && prev === nextSignal) return;
  localStorage.setItem(LS.lastSignal, nextSignal);
  const audio = $("beepAudio");
  try {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } catch {}
}

function setFedCards({ iorb, sofr, source }) {
  animateNumber($("iorbValue"), fmtPct(iorb, 3));
  animateNumber($("sofrValue"), fmtPct(sofr, 3));
  $("iorbSource").textContent = `Fuente: ${source.iorb}`;
  $("sofrSource").textContent = `Fuente: ${source.sofr}`;

  const spread = sofr - iorb;
  animateNumber($("spreadValue"), fmtPct(spread, 3));
}

function setBtcCards({ price, change24h }) {
  animateNumber($("btcPrice"), fmtMoney(price));
  const cls = change24h == null ? "" : change24h >= 0 ? "is-green" : "is-red";
  const txt = change24h == null ? "—" : `${change24h.toFixed(2)}% (24h)`;
  const el = $("btcChange24h");
  el.className = `card__sub ${cls}`;
  el.textContent = txt;
}

async function computeAndRender({ rangeDays, fed }) {
  setStatus("info", "Descargando BTC…");
  const [market, prices, ohlcRows] = await Promise.all([
    fetchBtcMarket(),
    fetchBtcDailyPrices(rangeDays),
    fetchBtcOhlc(rangeDays).catch(() => []),
  ]);

  setBtcCards(market);

  // Labels used to align everything
  const labels = prices.map((p) => isoDate(p.t));
  const btc = prices.map((p) => p.v);
  const priceNow = market?.price ?? btc[btc.length - 1];

  // Build OHLC aligned to labels early (used by ATR/confidence/backtest/toolkit)
  const ohlcMap = new Map(ohlcRows.map((r) => [r.date, r]));
  const ohlc = labels.map((d, i) => {
    const r = ohlcMap.get(d);
    // fallback: approximate candle with close-only if missing
    const c = btc[i];
    return r ? { o: r.o, h: r.h, l: r.l, c: r.c } : { o: c, h: c, l: c, c };
  });

  // SOFR historical from NY Fed (no key). IORB from: schedule > manual > FRED CSV (no key) > fallback.
  let iorbLine = prices.map(() => fed.iorbFallback);
  let sofrLine = prices.map(() => fed.sofrFallback);
  let spreadDaily = prices.map(() => fed.sofrFallback - fed.iorbFallback);
  let corr7 = null;
  let corr30 = null;
  let corr90 = null;
  let corrNote = "";

  const rets = pctReturns(prices);
  if (!rets) throw new Error("No se pudieron calcular retornos de BTC.");

  try {
    setStatus("info", "Descargando SOFR histórico (NY Fed)…");
    const start = new Date(labels[0] + "T00:00:00Z");
    start.setUTCDate(start.getUTCDate() - 7);
    const startDate = isoDate(start);
    const endDate = labels[labels.length - 1];
    const sofrSeries = fed.sofrManual != null ? null : await fetchNybSofrSeries({ startDate, endDate });
    sofrLine =
      fed.sofrManual != null
        ? prices.map(() => fed.sofrManual)
        : alignDailyForwardFill({ labels, series: sofrSeries, fallbackValue: fed.sofrFallback });
    fed.__sofrEffectiveDate = sofrSeries?.length ? sofrSeries[sofrSeries.length - 1].date : null;

    // IORB series source priority:
    // 1) schedule (user-defined)
    // 2) manual constant
    // 3) FRED graph CSV (no key)
    if (fed.iorbScheduleSeries) {
      iorbLine = alignDailyForwardFill({ labels, series: fed.iorbScheduleSeries, fallbackValue: fed.iorbFallback });
    } else if (fed.iorbManual != null) {
      iorbLine = prices.map(() => fed.iorbManual);
    } else {
      try {
        setStatus("info", "Descargando IORB histórico (FRED CSV)…");
        const { series: iorbSeries, source } = await fetchIorbSeriesFromFredCsv({ startDate, endDate });
        iorbLine = alignDailyForwardFill({ labels, series: iorbSeries, fallbackValue: fed.iorbFallback });
        corrNote = ` (IORB: ${source})`;
        fed.__iorbEffectiveDate = iorbSeries.length ? iorbSeries[iorbSeries.length - 1].date : null;
      } catch (e) {
        console.warn(e);
        iorbLine = prices.map(() => fed.iorbFallback);
        corrNote = " (IORB: fallback)";
      }
    }

    spreadDaily = labels.map((_, i) => sofrLine[i] - iorbLine[i]);

    // Correlate BTC returns (length n-1) with spread levels (aligned, drop first day)
    const spreadForRets = spreadDaily.slice(1);
    corr7 = pearson(rets.slice(-7), spreadForRets.slice(-7));
    corr30 = pearson(rets.slice(-30), spreadForRets.slice(-30));
    corr90 = pearson(rets.slice(-90), spreadForRets.slice(-90));
  } catch (e) {
    console.warn(e);
    corrNote = " (SOFR NY Fed falló)";
  }

  buildChart({ labels, btc, iorb: iorbLine, sofr: sofrLine });

  // Aux: spread + rolling corr30
  const spreadForRets = spreadDaily.slice(1);
  const roll = rollingPearson({ x: rets, y: spreadForRets, window: 30 });
  const rollAligned = [null, ...roll];
  buildAuxChart({ labels, spread: spreadDaily, rollingCorr30: rollAligned });

  $("corr7").textContent = corr7 == null ? "—" : fmtNum(corr7, 3);
  $("corr30").textContent = corr30 == null ? "—" : fmtNum(corr30, 3);
  $("corr90").textContent = corr90 == null ? "—" : fmtNum(corr90, 3);

  // Current values: last known values on the chart window
  const iorbNow = iorbLine[iorbLine.length - 1];
  const sofrNow = sofrLine[sofrLine.length - 1];
  const spreadNow = sofrNow - iorbNow;

  // Parity regime (OPERAR / NO OPERAR)
  const parityBps = fed.parityBps ?? 5;
  const parityTh = parityBps / 100.0;
  const inParity = Number.isFinite(spreadNow) && Math.abs(spreadNow) <= parityTh;
  $("regimeText").textContent = inParity ? `OPERAR (±${parityBps} bps)` : `NO OPERAR (±${parityBps} bps)`;

  // Update rate cards with actual resolved sources
  const iorbSource =
    fed.iorbScheduleSeries
      ? "Tramos (manual)"
      : fed.iorbManual != null
        ? "Manual"
        : corrNote.includes("FRED CSV")
          ? "FRED CSV (sin key)"
          : "Fallback";
  const sofrSource = fed.sofrManual != null ? "Manual (override)" : "NY Fed Markets API";
  const iorbDate = fed.__iorbEffectiveDate ? ` · ${fed.__iorbEffectiveDate}` : "";
  const sofrDate = fed.__sofrEffectiveDate ? ` · ${fed.__sofrEffectiveDate}` : "";
  setFedCards({
    iorb: iorbNow,
    sofr: sofrNow,
    source: { iorb: `${iorbSource}${iorbDate}`, sofr: `${sofrSource}${sofrDate}` },
  });

  // Trend using last 14 days of spread levels (if we have them), else compare vs last stored.
  const trend =
    spreadDaily && spreadDaily.length >= 14
      ? trendFromSeries(spreadDaily.slice(-14))
      : (() => {
          const prevSpread = safeNumFromInput(localStorage.getItem("iorbsofr:lastSpread"));
          localStorage.setItem("iorbsofr:lastSpread", String(spreadNow));
          return prevSpread == null ? { label: "—", slope: null } : trendFromSeries([prevSpread, spreadNow]);
        })();
  $("spreadTrend").textContent = `Tendencia: ${trend.label}`;

  const { signal, explanation } = decideSignal({
    iorb: iorbNow,
    sofr: sofrNow,
    corr30,
    spreadTrend: trend,
  });
  // New direction (simple + macro):
  // If not in parity => force NEUTRAL
  // If in parity => direction by 7d change in spread (improving => LONG, worsening => SHORT)
  let finalSignal = signal;
  let finalExplain = explanation;
  if (!inParity) {
    finalSignal = "NEUTRAL";
    finalExplain =
      `Fuera de paridad: |SOFR−IORB| = ${fmtPct(Math.abs(spreadNow), 3)} > ${fmtPct(parityTh, 3)}. ` +
      "Regla: solo operar en paridad → NEUTRAL.";
  } else {
    const idx = spreadDaily.length - 1;
    const d7 = idx >= 7 ? spreadDaily[idx] - spreadDaily[idx - 7] : 0;
    if (d7 < 0) {
      finalSignal = "LONG";
      finalExplain =
        `En paridad (±${parityBps} bps). Spread 7d bajando (${fmtPct(d7, 3)}) → mejora de liquidez → sesgo LONG. ` +
        `corr30 = ${corr30 == null ? "—" : fmtNum(corr30, 3)}.`;
    } else if (d7 > 0) {
      finalSignal = "SHORT";
      finalExplain =
        `En paridad (±${parityBps} bps). Spread 7d subiendo (${fmtPct(d7, 3)}) → stress/liquidez peor → sesgo SHORT. ` +
        `corr30 = ${corr30 == null ? "—" : fmtNum(corr30, 3)}.`;
    } else {
      finalSignal = "NEUTRAL";
      finalExplain = `En paridad (±${parityBps} bps), pero cambio 7d del spread ≈ 0 → NEUTRAL.`;
    }
  }

  const atrSeries = atr14(ohlc);
  const atrNow = atrSeries[atrSeries.length - 1];
  const idxNow = spreadDaily.length - 1;
  const d7Now = idxNow >= 7 ? spreadDaily[idxNow] - spreadDaily[idxNow - 7] : 0;
  const strength = confidenceLabel({
    signal: finalSignal,
    inParity,
    d7: d7Now,
    parityTh,
    corr30,
    atrNow,
    priceNow,
  });

  const sub = `Ventana: ${rangeDays}d · spread ${fmtPct(spreadNow, 3)} · corr30 ${corr30 == null ? "—" : fmtNum(corr30, 3)}${corrNote}`;
  setSignalUI({ signal: finalSignal, strength, sub, explanation: finalExplain });
  maybeBeepOnSignalChange(finalSignal);

  // --- "Estrategia de niveles" (stateless plan) ---
  function parseLevels(text) {
    if (!text) return [];
    const toks = text
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const zones = [];
    for (const t of toks) {
      const m = t.replace(/\s/g, "").match(/^(\d+(\.\d+)?)(-(\d+(\.\d+)?))?$/);
      if (!m) continue;
      const a = Number(m[1]);
      const b = m[4] ? Number(m[4]) : null;
      if (!Number.isFinite(a)) continue;
      if (b == null) zones.push({ lo: a, hi: a, label: `${Math.round(a).toLocaleString()} USD`, mid: a });
      else if (Number.isFinite(b)) {
        const lo = Math.min(a, b);
        const hi = Math.max(a, b);
        zones.push({
          lo,
          hi,
          label: `${Math.round(lo).toLocaleString()}–${Math.round(hi).toLocaleString()} USD`,
          mid: (lo + hi) / 2,
        });
      }
    }
    zones.sort((x, y) => x.mid - y.mid);
    return zones;
  }

  const autoLevels = () => {
    if (!Number.isFinite(priceNow) || priceNow <= 0) return [];
    // dynamic grid based on volatility (ATR), clamped to a reasonable range
    const step = Number.isFinite(atrNow) && atrNow > 0 ? clamp((atrNow * 2) / priceNow, 0.01, 0.04) : 0.02;
    const n = 6;
    const zones = [];
    for (let i = -n; i <= n; i++) {
      const lv = priceNow * (1 + i * step);
      zones.push({ lo: lv, hi: lv, label: `${Math.round(lv).toLocaleString()} USD`, mid: lv, auto: true });
    }
    zones.sort((a, b) => a.mid - b.mid);
    return zones;
  };

  const levels = parseLevels(fed.levelsInput);
  const activeLevels = levels.length ? levels : autoLevels();

  // If we're in parity but spread has no direction, use LEVEL BREAKOUT as primary trigger (best UX for futures).
  if (inParity && finalSignal === "NEUTRAL" && activeLevels.length && Number.isFinite(priceNow)) {
    const prevPrice = Number(localStorage.getItem(LS.lastPrice) || "NaN");
    const tolBreak = 0.0015; // 0.15% confirmation beyond the level
    const up = activeLevels.find((z) => z.hi >= priceNow) || activeLevels[activeLevels.length - 1];
    const down = [...activeLevels].reverse().find((z) => z.lo <= priceNow) || activeLevels[0];

    // Use close-to-close direction as tiny confirmation
    const lastClose = btc[btc.length - 1];
    const prevClose = btc.length >= 2 ? btc[btc.length - 2] : lastClose;

    const brokeUp =
      Number.isFinite(prevPrice) &&
      prevPrice < up.hi &&
      priceNow >= up.hi * (1 + tolBreak) &&
      lastClose >= prevClose;
    const brokeDown =
      Number.isFinite(prevPrice) &&
      prevPrice > down.lo &&
      priceNow <= down.lo * (1 - tolBreak) &&
      lastClose <= prevClose;

    if (brokeUp) {
      finalSignal = "LONG";
      finalExplain =
        `En paridad (±${parityBps} bps) y spread plano → gatillo por ruptura de nivel. ` +
        `Rompió arriba ${up.label} (+${(tolBreak * 100).toFixed(2)}% confirmación) → LONG.`;
    } else if (brokeDown) {
      finalSignal = "SHORT";
      finalExplain =
        `En paridad (±${parityBps} bps) y spread plano → gatillo por ruptura de nivel. ` +
        `Rompió abajo ${down.label} (-${(tolBreak * 100).toFixed(2)}% confirmación) → SHORT.`;
    }
  }
  const planActionEl = $("planAction");
  const planTargetEl = $("planTarget");
  const planExplainEl = $("planExplain");

  if (!activeLevels.length || !Number.isFinite(priceNow)) {
    planActionEl.textContent = inParity ? "OPERAR" : "ESPERAR";
    planTargetEl.textContent = "—";
    planExplainEl.textContent =
      "Añade niveles en Ajustes para que el plan marque el próximo objetivo (cerrar/esperar/abrir).";
  } else {
    const above = activeLevels.find((z) => z.hi >= priceNow);
    const below = [...activeLevels].reverse().find((z) => z.lo <= priceNow);
    const tol = 0.0025; // 0.25% proximity to consider 'at level'
    const near = (z) => priceNow >= z.lo * (1 - tol) && priceNow <= z.hi * (1 + tol);

    let target = null;
    if (finalSignal === "LONG") target = above || activeLevels[activeLevels.length - 1];
    else if (finalSignal === "SHORT") target = below || activeLevels[0];

    if (!inParity) {
      planActionEl.textContent = "ESPERAR";
      planTargetEl.textContent = target ? target.label : "—";
      planExplainEl.textContent = "Fuera de paridad → no abrir. Espera hasta volver a paridad.";
    } else if (finalSignal === "NEUTRAL") {
      planActionEl.textContent = "ESPERAR";
      planTargetEl.textContent = "—";
      planExplainEl.textContent = levels.length
        ? "En paridad, pero sin dirección clara → esperar confirmación."
        : "En paridad, pero sin dirección clara → esperar. (Niveles auto por ATR: añade los tuyos en Ajustes.)";
    } else if (target && near(target)) {
      planActionEl.textContent = "CERRAR / ESPERAR";
      planTargetEl.textContent = target.label;
      planExplainEl.textContent =
        "Precio en zona objetivo. Según la estrategia: cerrar, esperar y re-entrar solo si consolida y continúa.";
    } else {
      planActionEl.textContent = `ABRIR ${finalSignal}`;
      planTargetEl.textContent = target ? target.label : "—";
      planExplainEl.textContent =
        "En paridad y con dirección. Target = siguiente nivel. Si retrocede, esperar; si se mantiene y avanza, mantener hasta el próximo nivel.";
    }
  }

  // Semáforo + one-liner
  const traffic = $("trafficLight");
  const one = $("oneLiner");
  if (traffic && one) {
    if (!inParity) {
      traffic.textContent = "⛔ NO OPERAR";
      one.textContent = "Fuera de paridad (liquidez no ideal).";
    } else if (planActionEl.textContent.startsWith("CERRAR")) {
      traffic.textContent = "✅ CERRAR / ESPERAR";
      one.textContent = "En nivel objetivo: protege y espera confirmación.";
    } else if (planActionEl.textContent.startsWith("ABRIR")) {
      traffic.textContent = "✅ EJECUTAR";
      one.textContent = "En paridad y con dirección: trade plan listo.";
    } else {
      traffic.textContent = "⏳ ESPERAR";
      one.textContent = "En paridad, pero sin gatillo de dirección.";
    }
  }

  // Breakout alerts (levels / zones) + parity enter/exit + RR + liq proximity
  try {
    const prevPrice = Number(localStorage.getItem(LS.lastPrice) || "NaN");
    const prevInParity = localStorage.getItem(LS.lastInParity) === "1";
    localStorage.setItem(LS.lastPrice, String(priceNow));
    localStorage.setItem(LS.lastInParity, inParity ? "1" : "0");

    if (prevPrice && Number.isFinite(prevPrice) && prevInParity !== inParity) {
      fireAlert(inParity ? `✅ Entró en paridad (±${parityBps} bps)` : `⛔ Salió de paridad (±${parityBps} bps)`);
    }

    if (Number.isFinite(prevPrice) && activeLevels.length) {
      // check crossings of the nearest level boundaries
      for (const z of activeLevels) {
        // breakout up through hi
        if (prevPrice < z.hi && priceNow >= z.hi) {
          fireAlert(`📈 Ruptura arriba: ${z.label}`);
          break;
        }
        // breakdown down through lo
        if (prevPrice > z.lo && priceNow <= z.lo) {
          fireAlert(`📉 Ruptura abajo: ${z.label}`);
          break;
        }
      }
    }

    // RR alert (only when we have an order ctx)
    if (window.__orderCtx?.rrNum != null && window.__orderCtx.rrNum >= 2 && coolDownOk(30_000)) {
      fireAlert(`🎯 RR >= 2R (${fmtNum(window.__orderCtx.rrNum, 2)}R)`);
    }

    // Liq near stop warning (from toolkit)
    const orderTxt = $("riskNote")?.textContent || "";
    if (orderTxt.includes("⚠ Liq muy cerca del stop") && coolDownOk(30_000)) {
      fireAlert("⚠ Liq muy cerca del stop (revisa leverage/margen extra)");
    }
  } catch {}

  pushHistory({
    when: nowIsoShort(),
    signal: finalSignal,
    strength,
    spreadPct: fmtPct(spreadNow, 3),
    corr30: corr30 == null ? "—" : fmtNum(corr30, 3),
  });
  renderHistory();

  $("lastUpdated").textContent = `Última actualización: ${nowIsoShort()}`;
  setStatus("ok", "Listo");

  window.__lastDataset = {
    labels,
    btc,
    iorb: iorbLine,
    sofr: sofrLine,
    spread: spreadDaily,
    rollingCorr30: rollAligned,
  };

  // Backtest (needs OHLC aligned to labels)
  const bt = backtestParityStrategy({
    labels,
    ohlc,
    spreadDaily,
    corr30Series: rollAligned, // rolling corr30 series
    parityBps,
  });
  $("btTrades").textContent = bt.n ? String(bt.n) : "0";
  $("btWinrate").textContent = bt.winrate == null ? "—" : pct(bt.winrate, 1);
  $("btExpR").textContent = bt.expR == null ? "—" : fmtNum(bt.expR, 2);
  $("btNote").textContent = bt.note;

  // Expose context for Futures Toolkit (ATR, plan, etc.)
  window.__riskCtx = {
    priceNow,
    atrNow,
    signal: finalSignal,
    inParity,
    planAction: $("planAction")?.textContent || "",
    planTarget: $("planTarget")?.textContent || "",
  };

  updateFuturesToolkitUI();

  // Persist last good dataset for "stale but usable" UX
  try {
    const snapshot = {
      at: nowIsoShort(),
      priceNow,
      iorbNow,
      sofrNow,
      spreadNow,
      corr30,
      signal: finalSignal,
      regime: $("regimeText")?.textContent || "",
      planAction: $("planAction")?.textContent || "",
      planTarget: $("planTarget")?.textContent || "",
    };
    localStorage.setItem(LS.lastOkDataset, JSON.stringify(snapshot));
  } catch {}

  maybeAlertPlanChange();
}

async function resolveFedRates({ preferFred }) {
  const { iorbManual, sofrManual, iorbSchedule, parityBps, levelsInput } = getFedStateFromUI();

  // SOFR: manual override if provided, else fetch latest from NY Fed (no key) when requested, else fallback.
  let sofrLatest = null;
  let sofrLatestDate = null;
  if (sofrManual == null && preferFred) {
    try {
      setStatus("info", "Consultando SOFR (NY Fed)…");
      const rr = await fetchNybSofrLatest();
      sofrLatest = rr?.value ?? null;
      sofrLatestDate = rr?.date ?? null;
      if (sofrLatest != null) $("manualSofr").placeholder = String(sofrLatest);
    } catch (e) {
      console.warn(e);
    }
  }

  // Parse IORB schedule (optional): lines "YYYY-MM-DD,VALUE"
  let iorbScheduleSeries = null;
  if (iorbSchedule) {
    const parsed = [];
    for (const line of iorbSchedule.split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const [dRaw, vRaw] = t.split(/[,\t;]/).map((x) => x.trim());
      if (!dRaw || !vRaw) continue;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dRaw)) continue;
      const n = safeNumFromInput(vRaw);
      if (!Number.isFinite(n)) continue;
      parsed.push({ date: dRaw, value: n });
    }
    if (parsed.length) {
      parsed.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      iorbScheduleSeries = parsed;
    }
  }

  // IORB latest (no key) to avoid wrong fallbacks if historical fetch/proxy fails later
  let iorbLatest = null;
  let iorbLatestDate = null;
  let iorbLatestSource = null;
  if (iorbManual == null && !iorbScheduleSeries && preferFred) {
    try {
      setStatus("info", "Consultando IORB (FRED CSV)…");
      const r = await fetchIorbLatestFromFredCsv();
      iorbLatest = r.value;
      iorbLatestDate = r.date;
      iorbLatestSource = r.source;
    } catch (e) {
      console.warn(e);
    }
  }

  return {
    // Keep fallbacks; final resolved values are taken from the aligned series inside computeAndRender
    iorbFallback: iorbLatest ?? 5.4,
    sofrFallback: sofrLatest ?? 5.3,
    iorbManual,
    sofrManual,
    iorbScheduleSeries,
    parityBps: parityBps ?? safeNumFromInput(localStorage.getItem(LS.parityBps) || "5") ?? 5,
    levelsInput: levelsInput || localStorage.getItem(LS.levelsInput) || "",
    __sofrEffectiveDate: sofrLatestDate,
    __iorbEffectiveDate: iorbLatestDate,
    __iorbLatestSource: iorbLatestSource,
  };
}

async function refresh({ preferFred }) {
  try {
    persistFedState();
    const rangeDays = Number(localStorage.getItem(LS.rangeDays) || "90");
    const fed = await resolveFedRates({ preferFred });
    await computeAndRender({ rangeDays, fed });
  } catch (e) {
    console.error(e);
    setStatus("err", "Error al cargar datos");
    // Try to show last known good snapshot (stale but useful)
    try {
      const raw = localStorage.getItem(LS.lastOkDataset);
      const snap = raw ? JSON.parse(raw) : null;
      if (snap?.at) {
        $("lastUpdated").textContent = `Última actualización: ${snap.at} (stale)`;
        setSignalUI({
          signal: snap.signal || "NEUTRAL",
          strength: "—",
          sub: `Modo offline/stale · spread ${fmtPct(snap.spreadNow, 3)} · corr30 ${snap.corr30 == null ? "—" : fmtNum(snap.corr30, 3)}`,
          explanation: `Mostrando último estado guardado. Error actual: ${String(e?.message || e)}`,
        });
        $("regimeText").textContent = snap.regime || "—";
        $("planAction").textContent = snap.planAction || "—";
        $("planTarget").textContent = snap.planTarget || "—";
        $("planExplain").textContent = "Datos en caché. Pulsa Actualizar cuando haya conexión.";
        return;
      }
    } catch {}
    setSignalUI({
      signal: "NEUTRAL",
      strength: "—",
      sub: "Revisa tu conexión o rate limits",
      explanation: String(e?.message || e),
    });
  }
}

function bindUI() {
  $("refreshBtn")?.addEventListener("click", () => refresh({ preferFred: true }));
  $("detailsBtn")?.addEventListener("click", () => {
    const next = !document.body.classList.contains("show-details");
    document.body.classList.toggle("show-details", next);
    localStorage.setItem(LS.details, next ? "1" : "0");
  });

  const openModal = (id) => {
    const m = $(id);
    m?.classList.add("is-open");
    m?.setAttribute("aria-hidden", "false");
  };
  const closeModal = (id) => {
    const m = $(id);
    m?.classList.remove("is-open");
    m?.setAttribute("aria-hidden", "true");
  };
  const openHelp = () => openModal("helpModal");
  const closeHelp = () => closeModal("helpModal");
  $("helpBtn")?.addEventListener("click", openHelp);
  $("helpLink")?.addEventListener("click", openHelp);
  $("helpClose")?.addEventListener("click", closeHelp);
  $("helpBackdrop")?.addEventListener("click", closeHelp);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeHelp();
      closeModal("statusModal");
    }
  });

  // Status modal
  const openStatus = () => {
    const snapRaw = localStorage.getItem(LS.lastOkDataset);
    const snap = snapRaw ? JSON.parse(snapRaw) : null;
    const src = [];
    if ($("iorbSource")?.textContent) src.push(`IORB: ${$("iorbSource").textContent}`);
    if ($("sofrSource")?.textContent) src.push(`SOFR: ${$("sofrSource").textContent}`);
    src.push("BTC: CoinGecko");
    $("sourceStatus") && ($("sourceStatus").innerText = src.join("\n"));
    $("staleStatus") &&
      ($("staleStatus").textContent = snap?.at ? `Último OK: ${snap.at}` : "Sin snapshot aún.");
    openModal("statusModal");
  };
  $("statusBtn")?.addEventListener("click", openStatus);
  $("statusClose")?.addEventListener("click", () => closeModal("statusModal"));
  $("statusBackdrop")?.addEventListener("click", () => closeModal("statusModal"));
  $("clearCacheBtn")?.addEventListener("click", async () => {
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.unregister()));
      }
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    window.location.reload();
  });
  $("exportCsvBtn")?.addEventListener("click", () => {
    const ds = window.__lastDataset;
    if (!ds?.labels?.length) return;
    const rows = ["date,btc_usd,iorb_pct,sofr_pct,spread_pct,rolling_corr30"];
    for (let i = 0; i < ds.labels.length; i++) {
      rows.push(
        [
          ds.labels[i],
          ds.btc[i],
          ds.iorb[i],
          ds.sofr[i],
          ds.spread[i],
          ds.rollingCorr30?.[i] ?? "",
        ].join(",")
      );
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `iorb-sofr-btc_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  $("soundToggle").addEventListener("change", (e) => {
    localStorage.setItem(LS.sound, e.target.checked ? "1" : "0");
  });
  $("explainToggle").addEventListener("change", (e) => {
    localStorage.setItem(LS.explain, e.target.checked ? "1" : "0");
    // just re-toggle current visibility
    $("signalExplain").style.display = e.target.checked ? "block" : "none";
  });

  document.querySelectorAll(".segmented__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const days = Number(btn.getAttribute("data-range"));
      if (!Number.isFinite(days)) return;
      setRangeDays(days);
      refresh({ preferFred: true });
    });
  });

  $("clearHistoryBtn").addEventListener("click", () => {
    localStorage.removeItem(LS.history);
    renderHistory();
  });

  $("iorbSchedule")?.addEventListener("input", (e) => {
    localStorage.setItem(LS.iorbSchedule, e.target.value);
  });

  $("parityBps")?.addEventListener("input", (e) => {
    const n = safeNumFromInput(e.target.value);
    if (n == null) localStorage.removeItem(LS.parityBps);
    else localStorage.setItem(LS.parityBps, String(n));
  });

  $("levelsInput")?.addEventListener("input", (e) => {
    const v = String(e.target.value || "").trim();
    if (!v) localStorage.removeItem(LS.levelsInput);
    else localStorage.setItem(LS.levelsInput, v);
  });

  $("copyLinkBtn")?.addEventListener("click", async () => {
    const parity = localStorage.getItem(LS.parityBps) || "5";
    const levels = localStorage.getItem(LS.levelsInput) || "";
    const u = new URL(window.location.href);
    u.searchParams.set("parityBps", parity);
    if (levels) u.searchParams.set("levels", levels);
    else u.searchParams.delete("levels");
    const txt = u.toString();
    try {
      await navigator.clipboard.writeText(txt);
      setStatus("ok", "Link copiado");
    } catch {
      prompt("Copia este link:", txt);
    }
  });

  $("alertsToggle")?.addEventListener("change", async (e) => {
    const on = !!e.target.checked;
    if (on && "Notification" in window && Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {}
    }
    localStorage.setItem(LS.alerts, on ? "1" : "0");
  });

  // Presets BingX (simple)
  $("presetSelect")?.addEventListener("change", (e) => {
    const v = e.target.value;
    const set = (id, val) => {
      const el = $(id);
      if (!el) return;
      el.value = String(val);
    };
    if (v === "conservador") {
      set("riskPct", 0.3);
      set("leverage", 5);
      set("feeBps", 10);
      set("marginExtraUsd", 50);
    } else if (v === "agresivo") {
      set("riskPct", 1.0);
      set("leverage", 15);
      set("feeBps", 16);
      set("marginExtraUsd", 0);
    } else {
      set("riskPct", 0.5);
      set("leverage", 10);
      set("feeBps", 12);
      set("marginExtraUsd", 20);
    }
    // persist & recompute
    ["riskPct", "leverage", "feeBps", "marginExtraUsd"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      const key = LS[id];
      if (key) localStorage.setItem(key, el.value.trim());
    });
    updateFuturesToolkitUI();
  });

  $("copyOrderBtn")?.addEventListener("click", async () => {
    const txt = $("orderText")?.textContent || "";
    if (!txt || txt === "—") return;
    try {
      await navigator.clipboard.writeText(txt);
      setStatus("ok", "Orden copiada");
    } catch {
      prompt("Copia la orden:", txt);
    }
  });

  $("saveTradeBtn")?.addEventListener("click", () => {
    const ctx = window.__orderCtx;
    if (!ctx) return;
    const items = loadJournal();
    items.unshift(ctx);
    saveJournal(items);
    renderJournal();
    setStatus("ok", "Guardado en Journal");
  });

  $("clearJournalBtn")?.addEventListener("click", () => {
    localStorage.removeItem(LS.journal);
    renderJournal();
  });

  $("journalList")?.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const row = e.target.closest("[data-jid]");
    if (!row) return;
    const id = row.getAttribute("data-jid");
    const act = btn.getAttribute("data-act");
    const items = loadJournal();
    const idx = items.findIndex((t) => t.id === id);
    if (idx === -1) return;
    if (act === "del") items.splice(idx, 1);
    if (act === "win") {
      items[idx].outcome = "win";
      items[idx].r = Number.isFinite(items[idx].rrNum) ? items[idx].rrNum : 1;
    }
    if (act === "loss") {
      items[idx].outcome = "loss";
      items[idx].r = -1;
    }
    saveJournal(items);
    renderJournal();
  });

  // Futures toolkit inputs (no buttons)
  const persist = () => {
    if ($("equityUsd")) localStorage.setItem(LS.equityUsd, $("equityUsd").value.trim());
    if ($("riskPct")) localStorage.setItem(LS.riskPct, $("riskPct").value.trim());
    if ($("leverage")) localStorage.setItem(LS.leverage, $("leverage").value.trim());
    if ($("mmrPct")) localStorage.setItem(LS.mmrPct, $("mmrPct").value.trim());
    if ($("marginExtraUsd")) localStorage.setItem(LS.marginExtraUsd, $("marginExtraUsd").value.trim());
    if ($("feeBps")) localStorage.setItem(LS.feeBps, $("feeBps").value.trim());
    updateFuturesToolkitUI();
  };
  ["equityUsd", "riskPct", "leverage", "mmrPct", "marginExtraUsd", "feeBps", "entryPrice", "stopPrice", "targetPrice"].forEach((id) => {
    $(id)?.addEventListener("input", persist);
  });
}

function maybeAlertPlanChange() {
  const alertsOn = localStorage.getItem(LS.alerts) === "1";
  if (!alertsOn) return;
  const regime = $("regimeText")?.textContent || "";
  const sig = $("signalText")?.textContent || "";
  const plan = $("planAction")?.textContent || "";
  const target = $("planTarget")?.textContent || "";
  const key = `${regime}|${sig}|${plan}|${target}`;
  const prev = localStorage.getItem(LS.lastPlanHash) || "";
  if (prev === key) return;
  localStorage.setItem(LS.lastPlanHash, key);

  // Skip the very first render to avoid spam on load
  if (!prev) return;

  if ("Notification" in window && Notification.permission === "granted") {
    try {
      new Notification("IORB/SOFR BTC", { body: `${regime} · ${sig} · ${plan} → ${target}` });
    } catch {}
  }
  // reuse existing beep toggle
  maybeBeepOnSignalChange(sig || "NEUTRAL");
}

function updateFuturesToolkitUI() {
  const ctx = window.__riskCtx || {};
  const side = ctx.signal === "SHORT" ? "SHORT" : ctx.signal === "LONG" ? "LONG" : "LONG";
  const priceNow = ctx.priceNow;
  const atr = ctx.atrNow;

  // Auto-fill placeholders
  if ($("entryPrice") && (String($("entryPrice").value || "").trim() === "")) {
    $("entryPrice").placeholder = priceNow ? String(Math.round(priceNow)) : "(auto)";
  }
  if ($("stopPrice") && (String($("stopPrice").value || "").trim() === "")) {
    if (priceNow && atr) {
      const stop = side === "LONG" ? priceNow - 1.5 * atr : priceNow + 1.5 * atr;
      $("stopPrice").placeholder = String(Math.round(stop));
    } else $("stopPrice").placeholder = "(auto)";
  }
  if ($("targetPrice") && (String($("targetPrice").value || "").trim() === "")) {
    // If plan target looks numeric, use it; else 2R from ATR stop
    const t = String(ctx.planTarget || "");
    const m = t.replace(/[^\d.]/g, "");
    const num = Number(m);
    if (Number.isFinite(num) && num > 0) $("targetPrice").placeholder = String(Math.round(num));
    else if (priceNow && atr) {
      const stopDist = 1.5 * atr;
      const target = side === "LONG" ? priceNow + 2 * stopDist : priceNow - 2 * stopDist;
      $("targetPrice").placeholder = String(Math.round(target));
    } else $("targetPrice").placeholder = "(auto)";
  }

  const equityUsd = safeNumFromInput($("equityUsd")?.value ?? "");
  const riskPct = safeNumFromInput($("riskPct")?.value ?? "0.5");
  const leverage = safeNumFromInput($("leverage")?.value ?? "10");
  const mmrPct = safeNumFromInput($("mmrPct")?.value ?? "0.5");
  const marginExtraUsd = safeNumFromInput($("marginExtraUsd")?.value ?? "0");
  const feeBps = safeNumFromInput($("feeBps")?.value ?? "12");

  const entry = safeNumFromInput($("entryPrice")?.value ?? "") ?? priceNow;
  let stop = safeNumFromInput($("stopPrice")?.value ?? "");
  if (stop == null && priceNow && atr) stop = side === "LONG" ? priceNow - 1.5 * atr : priceNow + 1.5 * atr;
  let target = safeNumFromInput($("targetPrice")?.value ?? "");
  if (target == null && priceNow && atr && stop != null) {
    const stopDist = Math.abs(priceNow - stop);
    target = side === "LONG" ? priceNow + 2 * stopDist : priceNow - 2 * stopDist;
  }

  const out = calcRiskToolkit({
    side,
    equityUsd,
    riskPct,
    leverage,
    mmrPct,
    marginExtraUsd,
    feeBps,
    entry,
    stop,
    target,
  });
  if (!out.ok) {
    $("posSizeBtc").textContent = "—";
    $("posNotional").textContent = "—";
    $("riskUsd").textContent = "—";
    $("rMultiple").textContent = "—";
    $("marginUsd").textContent = "—";
    $("liqPrice").textContent = "—";
    $("riskNote").textContent = out.msg + (ctx.inParity === false ? " (además: NO OPERAR)" : "");
    return;
  }

  $("posSizeBtc").textContent = `${fmtNum(out.qtyBtc, 4)} BTC`;
  $("posNotional").textContent = `Notional: ${fmtUsd(out.notional, 0)} USDT`;
  $("riskUsd").textContent = `${fmtUsd(out.riskUsd, 2)} USDT`;
  $("rMultiple").textContent = out.rr == null ? "RR: —" : `RR: ${fmtNum(out.rr, 2)}R`;
  $("feeCost") && ($("feeCost").textContent = `Fees~ ${fmtUsd(out.feeCost, 2)} USDT (eff risk ${fmtUsd(out.effectiveRiskUsd, 2)})`);
  $("marginUsd").textContent = `${fmtUsd(out.margin, 2)} USDT`;
  $("liqPrice").textContent = out.liq == null ? "Liq: —" : `Liq~ ${fmtUsd(out.liq, 0)}`;
  const stopDist = Math.abs(entry - stop);
  const liqDist = out.liq == null ? null : Math.abs(entry - out.liq);
  const liqWarn = liqDist != null && stopDist > 0 && liqDist < stopDist * 1.2;
  $("riskNote").textContent =
    `BingX USDT perp (aprox) · Side: ${side} · Lev: ${fmtNum(out.lev, 0)}x · MMR: ${(out.mmr * 100).toFixed(2)}% · Extra: ${fmtUsd(out.extra, 0)} · ` +
    (ctx.inParity ? "Régimen: OPERAR" : "Régimen: NO OPERAR") +
    (liqWarn ? " · ⚠ Liq muy cerca del stop" : "");

  // Suggested order text + journal payload
  const rrTxt = out.rr == null ? "—" : `${fmtNum(out.rr, 2)}R`;
  const txt =
    `BingX USDT Perp\n` +
    `Side: ${side}\n` +
    `Entry: ${fmtUsd(entry, 2)}\n` +
    `Stop: ${fmtUsd(stop, 2)}\n` +
    `TP: ${fmtUsd(target, 2)}\n` +
    `Qty: ${fmtNum(out.qtyBtc, 4)} BTC\n` +
    `Leverage: ${fmtNum(out.lev, 0)}x\n` +
    `Margin~: ${fmtUsd(out.margin, 2)} USDT (+extra ${fmtUsd(out.extra, 2)})\n` +
    `Liq~: ${out.liq == null ? "—" : fmtUsd(out.liq, 0)}\n` +
    `Risk: ${fmtUsd(out.riskUsd, 2)} USDT (fees~ ${fmtUsd(out.feeCost, 2)}; eff ${fmtUsd(out.effectiveRiskUsd, 2)})\n` +
    `RR: ${rrTxt}\n` +
    `Plan: ${ctx.planAction || ""} → ${ctx.planTarget || ""}`;
  $("orderText") && ($("orderText").textContent = txt);
  window.__orderCtx = {
    id: crypto?.randomUUID ? crypto.randomUUID() : String(Date.now()) + "_" + Math.random().toString(16).slice(2),
    when: nowIsoShort(),
    side,
    entry: fmtUsd(entry, 2),
    stop: fmtUsd(stop, 2),
    target: fmtUsd(target, 2),
    qtyBtc: fmtNum(out.qtyBtc, 4),
    rr: out.rr == null ? "—" : fmtNum(out.rr, 2),
    rrNum: out.rr == null ? null : out.rr,
    outcome: null,
    r: null,
  };
}

function applyQueryConfigToUI() {
  const u = new URL(window.location.href);
  const p = u.searchParams.get("parityBps");
  const lv = u.searchParams.get("levels");
  if (p && $("parityBps")) {
    $("parityBps").value = p;
    localStorage.setItem(LS.parityBps, p);
  }
  if (lv != null && $("levelsInput")) {
    $("levelsInput").value = lv;
    if (lv.trim()) localStorage.setItem(LS.levelsInput, lv.trim());
  }
}

function isStaleForToday() {
  const last = localStorage.getItem(LS.lastDailyRefresh) || "";
  const today = isoDate(new Date());
  return last !== today;
}

function markRefreshedToday() {
  localStorage.setItem(LS.lastDailyRefresh, isoDate(new Date()));
}

function msUntilNextLocalTime(hours, minutes) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.getTime() - now.getTime();
}

function scheduleDailyRefresh() {
  // Run once per day at 00:05 local time (and also on focus if stale)
  const run = async () => {
    await refresh({ preferFred: true });
    markRefreshedToday();
  };

  setTimeout(() => {
    run();
    setInterval(run, 24 * 60 * 60 * 1000);
  }, msUntilNextLocalTime(0, 5));

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && isStaleForToday()) run();
  });
}

function boot() {
  restoreUIState();
  applyQueryConfigToUI();
  bindUI();
  renderHistory();
  renderJournal();
  // Always refresh on load (simple, predictable).
  refresh({ preferFred: true }).then(markRefreshedToday).catch(() => {});
  scheduleDailyRefresh();

  // PWA
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .register(`./sw.js?v=${APP_VERSION}`)
      .then((reg) => {
        // If there's an updated SW waiting, activate it immediately.
        if (reg.waiting) reg.waiting.postMessage({ type: "SKIP_WAITING" });
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;
          sw.addEventListener("statechange", () => {
            if (sw.state === "installed" && navigator.serviceWorker.controller) {
              sw.postMessage({ type: "SKIP_WAITING" });
            }
          });
        });
      })
      .catch(() => {});

    // Reload once the new SW takes control so you don't see stale UI labels.
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      window.location.reload();
    });
  }
}

boot();

