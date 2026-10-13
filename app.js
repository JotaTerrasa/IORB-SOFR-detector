import {
  day,
  number,
  csvSeries,
  atDate,
  correlations,
  liquidity,
  spreadRows,
  hypothesis,
  riskPosition,
  backtest,
  staleSofr,
} from "./lib/analytics.js";
import { migrateJournal } from "./lib/migrate.js";
const VERSION = "20261013_1",
  $ = (id) => document.getElementById(id);
const fmt = (n, d = 2) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-ES", {
        minimumFractionDigits: d,
        maximumFractionDigits: d,
      })
    : "—";
const usd = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-ES", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 1,
      })
    : "—";
const pct = (n) => (Number.isFinite(n) ? `${fmt(n, 2)} %` : "—");
const date = (d) =>
  d ? new Date(d + "T12:00:00Z").toLocaleDateString("es-ES") : "—";
const time = (t) => (t ? new Date(t).toLocaleString("es-ES") : "—");
const sign = (n) =>
  Number.isFinite(n) ? `${n > 0 ? "+" : ""}${fmt(n, 1)}` : "—";
const storage = {
  get(k, fallback = null) {
    try {
      return JSON.parse(localStorage.getItem("liquidity:v2:" + k)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("liquidity:v2:" + k, JSON.stringify(v));
      return true;
    } catch {
      toast("No se ha podido guardar en este navegador.");
      return false;
    }
  },
  remove(k) {
    try {
      localStorage.removeItem("liquidity:v2:" + k);
    } catch {}
  },
};
let prefs = storage.get("prefs", {
    band: 5,
    range: 90,
    refresh: 300,
    alerts: false,
  }),
  data = {},
  health = {},
  charts = {},
  busy = false,
  lastRefresh = 0,
  position = null,
  journal = storage.get("journal", []),
  ws = null,
  reconnect = null,
  liveAt = 0,
  quote = null,
  lastReading = null;
if (![90, 180, 365].includes(prefs.range)) prefs.range = 90;
if (![300, 900, 1800].includes(prefs.refresh)) prefs.refresh = 300;
if (!Number.isFinite(prefs.band) || prefs.band < 1 || prefs.band > 100)
  prefs.band = 5;
if (!Array.isArray(journal)) journal = [];
if (storage.get("journal") == null) {
  try {
    const legacy = JSON.parse(localStorage.getItem("iorbsofr:journal") || "[]");
    if (legacy.length) {
      journal = migrateJournal(legacy);
      storage.set("journal", journal);
    }
  } catch {}
}

let manual = { iorb: null, sofr: null },
  riskText = "",
  currentSimulation = null;
function text(id, value) {
  $(id).textContent = value;
}
function toast(message) {
  text("toast", message);
  $("toast").hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => ($("toast").hidden = true), 4000);
}
function node(tag, content, className) {
  const el = document.createElement(tag);
  if (content != null) el.textContent = content;
  if (className) el.className = className;
  return el;
}
function cell(row, value, className) {
  row.append(node("td", value, className));
}
function download(filename, rows) {
  const csv =
    "\uFEFF" +
    rows
      .map((row) =>
        row.map((v) => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","),
      )
      .join("\r\n");
  const url = URL.createObjectURL(
    new Blob([csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = node("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast("Descarga preparada.");
}
async function request(url, format = "json") {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(url, {
        cache: "no-store",
        signal: AbortSignal.timeout(15000),
      });
      if (!r.ok) {
        const e = new Error(`HTTP ${r.status}`);
        e.retryable = r.status >= 500;
        throw e;
      }
      return {
        payload: await (format === "text" ? r.text() : r.json()),
        sourceMode: r.headers.get("X-Data-Source"),
        sourceFetchedAt: r.headers.get("X-Data-Fetched-At"),
      };
    } catch (e) {
      if (attempt || e.retryable === false) throw e;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
}
async function source(key, url, parser = (x) => x, format = "json") {
  try {
    const response = await request(url, format);
    const result = parser(response.payload);
    if (result == null) throw new Error("Datos vacíos");
    data[key] = result;
    health[key] = {
      ok: true,
      at: new Date().toISOString(),
      stale: false,
      sourceMode: response.sourceMode,
      sourceFetchedAt: response.sourceFetchedAt,
    };
    storage.set("cache:" + key, { value: result, at: health[key].at });
  } catch (e) {
    const cached = storage.get("cache:" + key);
    data[key] = cached?.value ?? null;
    health[key] = {
      ok: false,
      at: cached?.at ?? null,
      stale: !!cached,
      error: e.message,
    };
  }
}
function switchPage(id) {
  if (!$(id)?.classList.contains("page")) return;
  document.querySelectorAll(".page").forEach((p) => (p.hidden = p.id !== id));
  document.querySelectorAll("[data-page]").forEach((b) => {
    b.classList.toggle("active", b.dataset.page === id);
    if (b.dataset.page === id) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  history.replaceState(null, "", "#" + id);
  window.scrollTo({ top: 0 });
  Object.values(charts).forEach((c) => c.resize());
}
function chart(id, labels, datasets, scales = {}) {
  if (typeof Chart === "undefined") {
    toast("No se ha podido cargar el motor de gráficos.");
    return;
  }
  charts[id]?.destroy();
  charts[id] = new Chart($(id), {
    type: "line",
    data: {
      labels,
      datasets: datasets.map((d) => ({
        borderWidth: 2,
        pointRadius: 0,
        pointHitRadius: 8,
        tension: 0.15,
        spanGaps: false,
        ...d,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          labels: {
            color: "#9cafbd",
            usePointStyle: true,
            boxWidth: 7,
            font: { size: 10 },
          },
        },
        tooltip: {
          callbacks: {
            title: (items) => date(items[0]?.label),
            label: (ctx) =>
              `${ctx.dataset.label}: ${fmt(ctx.parsed.y, ctx.dataset.yAxisID === "corr" ? 3 : 1)}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#8296a6",
            maxTicksLimit: 7,
            font: { size: 10 },
            callback: (v, i) => date(labels[i]).slice(0, 5),
          },
        },
        ...scales,
      },
    },
  });
}
function axis(title, position = "left", extra = {}) {
  return {
    type: "linear",
    position,
    title: { display: true, text: title, color: "#9cafbd", font: { size: 10 } },
    grid: { color: "#2e3d4966", drawOnChartArea: position === "left" },
    ticks: { color: "#9cafbd", font: { size: 10 } },
    ...extra,
  };
}
function rates() {
  const s = data.sofr?.at(-1),
    i = s ? atDate(data.iorb || [], s.date) : null;
  return {
    s,
    i,
    latestI: data.iorb?.at(-1),
    spread: s && i ? (s.value - i.value) * 100 : null,
    rows: spreadRows(data.sofr || [], data.iorb || []),
  };
}
function renderRates() {
  const { s, i, latestI, spread, rows } = rates();
  text("sofrValue", pct(s?.value));
  text("iorbValue", pct(latestI?.value));
  text(
    "sofrDate",
    `NY Fed · operaciones del ${date(s?.date)}${health.sofr?.stale ? " · copia antigua" : ""}`,
  );
  text(
    "iorbDate",
    `${health.iorb?.sourceMode === "verified-snapshot" ? "FRED · copia verificada" : "FRED"} · vigente el ${date(latestI?.date)}${health.iorb?.stale ? " · copia antigua" : ""}`,
  );
  text("spreadValue", Number.isFinite(spread) ? `${sign(spread)} pb` : "—");
  text(
    "spreadDate",
    s && i
      ? `Tasas comparadas el ${date(s.date)}`
      : "Esperando tasas comparables",
  );
  const delta = rows.length >= 8 ? rows.at(-1).value - rows.at(-8).value : null;
  text(
    "spreadChange",
    Number.isFinite(delta)
      ? `${sign(delta)} pb frente a 7 observaciones atrás`
      : "Faltan observaciones para comparar",
  );
  const isManual = manual.iorb != null || manual.sofr != null;
  const readingSpread =
    isManual &&
    number(manual.iorb ?? latestI?.value) != null &&
    number(manual.sofr ?? s?.value) != null
      ? ((manual.sofr ?? s.value) - (manual.iorb ?? latestI.value)) * 100
      : spread;
  const reading = liquidity(readingSpread, prefs.band);
  const stale =
    (!isManual &&
      (health.sofr?.stale || health.iorb?.stale || staleSofr(s?.date))) ||
    (isManual &&
      ((manual.iorb == null && !health.iorb?.ok) ||
        (manual.sofr == null && !health.sofr?.ok)));
  text(
    "readingTitle",
    stale ? "Lectura pendiente de actualización" : reading.label,
  );
  text(
    "readingDetail",
    `${isManual ? `Escenario manual: ${sign(readingSpread)} pb. ` : ""}${stale ? "Los datos disponibles requieren revisión de su fecha. " : ""}${reading.detail}`,
  );
  text(
    "readingBadge",
    isManual
      ? "ESCENARIO MANUAL"
      : stale
        ? "DATOS A REVISAR"
        : Number.isFinite(spread)
          ? `BANDA ±${prefs.band} PB`
          : "SIN DATOS",
  );
  $("readingBadge").classList.toggle(
    "warn",
    stale || reading.tone === "warn" || isManual,
  );
  $("readingTitle")
    .closest(".reading")
    .classList.toggle("warn", stale || reading.tone === "warn" || isManual);
  text(
    "readingTrend",
    `${isManual ? "Histórico oficial" : "Tendencia"}: ${delta == null ? "sin datos" : delta < -0.5 ? "diferencial descendente" : delta > 0.5 ? "diferencial ascendente" : "estable"}`,
  );
  if (
    lastReading &&
    lastReading !== reading.label &&
    prefs.alerts &&
    !stale &&
    !isManual
  ) {
    toast(`Régimen: ${reading.label}`);
    beep();
  }
  lastReading = reading.label;
  const warnings = [];
  if (isManual)
    warnings.push(
      "Escenario manual activo en la lectura de financiación. Las tarjetas y el histórico siguen mostrando las fuentes oficiales.",
    );
  for (const [key, h] of Object.entries(health))
    if (!h.ok)
      warnings.push(
        `${sourceName(key)}: ${h.stale ? "mostrando copia antigua" : "no disponible"}.`,
      );
  if (s && staleSofr(s.date) && health.sofr?.ok)
    warnings.push(
      "La última observación de SOFR está retrasada respecto a su calendario habitual.",
    );
  if (data.macro)
    for (const key of ["tga", "reserves", "rrp"])
      if (data.macro[key]?.error)
        warnings.push(`${sourceName(key)}: no disponible.`);
  $("banner").hidden = !warnings.length;
  text("banner", warnings.join(" "));
}
function renderQuote() {
  if (!quote) {
    text("btcPrice", "—");
    text("btcChange", "Cotización no disponible");
    return;
  }
  text("btcPrice", usd(quote.price));
  text(
    "btcChange",
    `${quote.change24h >= 0 ? "+" : ""}${pct(quote.change24h)} · 24 h`,
  );
  $("btcChange").className = quote.change24h >= 0 ? "positive" : "negative";
  text(
    "btcDate",
    `${ws?.readyState === WebSocket.OPEN && navigator.onLine && Date.now() - liveAt < 60000 ? "Coinbase · directo" : "Coinbase · última consulta"} ${time(quote.fetchedAt)}${health.quote?.stale ? " · copia antigua" : ""}`,
  );
}
function displayCandles() {
  return (data.history?.candles || []).slice(-prefs.range);
}
function renderHistory() {
  const candles = displayCandles(),
    labels = candles.map((c) => c.date),
    { rows } = rates(),
    map = new Map(rows.map((r) => [r.date, r.value]));
  text(
    "chartNote",
    `${candles.length} velas diarias cerradas${candles.length ? ` · ${date(labels[0])} a ${date(labels.at(-1))}` : ""}. SOFR no se rellena en días sin observación. ${health.history?.stale ? "Histórico guardado; consulta actual fallida." : ""}`,
  );
  $("chartEmpty").hidden = !!candles.length;
  chart(
    "mainChart",
    labels,
    [
      {
        label: "BTC (USD)",
        data: candles.map((c) => c.c),
        borderColor: "#78dec6",
        yAxisID: "btc",
      },
      {
        label: "SOFR − IORB (pb)",
        data: labels.map((d) => map.get(d) ?? null),
        borderColor: "#e7bc77",
        yAxisID: "spread",
      },
    ],
    { btc: axis("BTC · USD"), spread: axis("Diferencial · pb", "right") },
  );
  const corr = correlations(
    data.history?.candles || [],
    data.sofr || [],
    data.iorb || [],
    30,
  );
  text("corrValue", fmt(corr.value, 3));
  text(
    "corrDetail",
    `${corr.n}/30 observaciones de SOFR comparadas con el retorno diario de BTC. ${corr.value == null ? "Muestra insuficiente o diferencial constante." : Math.abs(corr.value) < 0.3 ? "Relación lineal débil en esta ventana." : "La asociación histórica no demuestra causalidad."}`,
  );
  $("correlations").replaceChildren();
  for (const n of [7, 30, 90]) {
    const c = correlations(
      data.history?.candles || [],
      data.sofr || [],
      data.iorb || [],
      n,
    );
    const card = node("article", null, "card");
    card.append(
      node("p", `${n} observaciones`, "eyebrow"),
      node("strong", fmt(c.value, 3)),
      node(
        "p",
        `${c.n}/${n} pares · ${c.value == null ? "sin cálculo fiable" : "Pearson"}`,
        "muted",
      ),
    );
    $("correlations").append(card);
  }
  const corrLabels = [],
    corrData = [];
  const availableSofr = (data.sofr || []).filter(
    (s) => labels.length && s.date >= labels[0] && s.date <= labels.at(-1),
  );
  for (const r of availableSofr) {
    corrLabels.push(r.date);
    corrData.push(
      correlations(
        data.history?.candles || [],
        (data.sofr || []).filter((s) => s.date <= r.date),
        data.iorb || [],
        30,
      ).value,
    );
  }
  chart(
    "corrChart",
    corrLabels,
    [
      {
        label: "Correlación 30 observaciones",
        data: corrData,
        borderColor: "#78dec6",
        yAxisID: "corr",
      },
    ],
    { corr: axis("Pearson", "left", { min: -1, max: 1 }) },
  );
  const h = hypothesis(rows, prefs.band);
  text("hypothesis", h.side);
  text(
    "hypothesisDetail",
    `${h.reason} ${h.delta == null ? "" : `Cambio de 7 intervalos: ${sign(h.delta)} pb.`}`,
  );
  const old = health.sofr?.stale || health.iorb?.stale || health.history?.stale;
  if (old)
    text(
      "hypothesisDetail",
      `Datos guardados o fuente fallida: hipótesis suspendida. ${h.reason}`,
    );
  if (old) text("hypothesis", "SIN DATOS ACTUALES");
  const fees = Math.max(0, Math.min(1000, number($("fees").value) ?? 12));
  currentSimulation = backtest(
    data.history?.candles || [],
    data.sofr || [],
    data.iorb || [],
    { band: prefs.band, fees },
  );
  currentSimulation.trades = currentSimulation.trades.filter(
    (t) => labels.length && t.date >= labels[0],
  );
  // Recompute statistics after restricting entries to the selected visible window.
  const ts = currentSimulation.trades;
  let sum = 0,
    peak = 0,
    dd = 0;
  for (const t of ts) {
    sum += t.netR;
    peak = Math.max(peak, sum);
    dd = Math.max(dd, peak - sum);
  }
  const stats = [
    ["Operaciones", String(ts.length)],
    [
      "Aciertos",
      ts.length
        ? pct((ts.filter((t) => t.netR > 0).length / ts.length) * 100)
        : "—",
    ],
    ["Media neta", ts.length ? `${fmt(sum / ts.length, 2)} R` : "—"],
    ["Caída máxima", `${fmt(dd, 2)} R`],
  ];
  $("backtestStats").replaceChildren(
    ...stats.map(([label, value]) => {
      const e = node("div", null, "stat");
      e.append(node("small", label), node("strong", value));
      return e;
    }),
  );
  text(
    "backtestNote",
    `Ventana ${prefs.range} días · banda ±${prefs.band} pb · comisión ${fmt(fees, 1)} pb ida y vuelta. ${ts.length < 20 ? "Muestra pequeña: resultados poco concluyentes." : ""} ${old ? "Simulación sobre copia histórica antigua." : ""} Las reservas y el TGA no forman parte de esta regla.`,
  );
  $("backtestRows").replaceChildren();
  for (const t of ts.slice(-20).reverse()) {
    const tr = node("tr");
    cell(tr, date(t.date));
    cell(tr, t.side);
    cell(tr, date(t.exitDate));
    cell(tr, `${sign(t.netR)} R`, t.netR >= 0 ? "positive" : "negative");
    cell(tr, t.reason);
    $("backtestRows").append(tr);
  }
  if (!ts.length) {
    const tr = node("tr");
    const td = node("td", "Sin operaciones o sin datos suficientes.");
    td.colSpan = 5;
    tr.append(td);
    $("backtestRows").append(tr);
  }
  $("export").disabled = !candles.length;
  $("exportTrades").disabled = !ts.length;
}
function renderMacro() {
  $("macroCards").replaceChildren();
  const m = data.macro;
  for (const [key, title, definition] of [
    ["tga", "Cuenta del Tesoro · TGA", "Saldo medio semanal en la Fed."],
    [
      "reserves",
      "Reservas bancarias",
      "Saldos medios semanales de los bancos en la Fed.",
    ],
    [
      "rrp",
      "Reverse repo · ON RRP",
      "Fondos colocados en la facilidad overnight de la Fed.",
    ],
  ]) {
    const r = m?.[key],
      last = r?.rows?.at(-1),
      prev = r?.rows?.at(-2),
      delta = last && prev ? last.value - prev.value : null;
    const card = node("article", null, "card");
    card.append(
      node("p", title, "eyebrow"),
      node(
        "strong",
        last ? `${fmt(last.value, key === "rrp" ? 3 : 1)} mil M$` : "—",
      ),
      node(
        "p",
        last
          ? `${delta != null ? `${delta > 0 ? "+" : ""}${fmt(delta, key === "rrp" ? 3 : 1)}` : "—"} mil M$ vs ${date(prev?.date)}`
          : r?.error || "Fuente no disponible",
        "muted",
      ),
      node(
        "small",
        `${definition} Observación: ${date(last?.date)}${r?.sourceMode === "verified-snapshot" ? " · copia verificada" : ""}${health.macro?.stale ? " · copia antigua" : ""}`,
      ),
    );
    const a = node(
      "a",
      `${r?.id || key.toUpperCase()} · ver fuente ↗`,
      "text-button",
    );
    a.href = `https://fred.stlouisfed.org/series/${r?.id || { tga: "WTREGEN", reserves: "WRESBAL", rrp: "RRPONTSYD" }[key]}`;
    a.target = "_blank";
    a.rel = "noopener";
    card.append(a);
    $("macroCards").append(card);
  }
  const tga = m?.tga?.rows || [],
    res = m?.reserves?.rows || [],
    labels = tga.slice(-52).map((r) => r.date),
    byRes = new Map(res.map((r) => [r.date, r.value]));
  chart(
    "macroChart",
    labels,
    [
      {
        label: "TGA · media semanal",
        data: tga.slice(-52).map((r) => r.value),
        borderColor: "#e7bc77",
        yAxisID: "tga",
      },
      {
        label: "Reservas · media semanal",
        data: labels.map((d) => byRes.get(d) ?? null),
        borderColor: "#78dec6",
        yAxisID: "res",
      },
    ],
    { tga: axis("TGA · mil M$"), res: axis("Reservas · mil M$", "right") },
  );
  text(
    "macroNote",
    `Últimos datos: TGA ${date(tga.at(-1)?.date)} · reservas ${date(res.at(-1)?.date)}. ${health.macro?.stale ? "Copia antigua: la última consulta falló." : "Series de frecuencia semanal; no representan el saldo actual del día."}`,
  );
  text("miniTga", tga.length ? `${fmt(tga.at(-1).value, 1)} mil M$` : "—");
  text("miniReserves", res.length ? `${fmt(res.at(-1).value, 1)} mil M$` : "—");
  text(
    "miniMacroNote",
    `Medias semanales: TGA ${date(tga.at(-1)?.date)} · reservas ${date(res.at(-1)?.date)}${health.macro?.stale ? " · copia antigua" : ""}.`,
  );
}
const sourceName = (key) =>
  ({
    quote: "BTC spot",
    history: "BTC histórico",
    sofr: "SOFR",
    iorb: "IORB",
    macro: "Liquidez macro",
    tga: "TGA",
    reserves: "Reservas",
    rrp: "ON RRP",
  })[key] || key;
function renderSources() {
  $("sourceRows").replaceChildren();
  const latest = {
    quote: quote?.fetchedAt?.slice(0, 10),
    history: data.history?.candles?.at(-1)?.date,
    sofr: data.sofr?.at(-1)?.date,
    iorb: data.iorb?.at(-1)?.date,
  };
  for (const key of ["quote", "history", "sofr", "iorb", "macro"]) {
    const h = health[key],
      tr = node("tr");
    const sourceCell = node("td"),
      link = node("a", sourceName(key));
    link.href = {
      quote: "https://exchange.coinbase.com/trade/BTC-USD",
      history: "https://exchange.coinbase.com/trade/BTC-USD",
      sofr: "https://www.newyorkfed.org/markets/reference-rates/sofr",
      iorb: "https://fred.stlouisfed.org/series/IORB",
      macro: "https://fred.stlouisfed.org/series/WTREGEN",
    }[key];
    link.target = "_blank";
    link.rel = "noopener";
    sourceCell.append(link);
    tr.append(sourceCell);
    cell(
      tr,
      h?.ok
        ? key === "macro" &&
          ["tga", "reserves", "rrp"].some((k) => data.macro?.[k]?.error)
          ? "Consulta parcial"
          : h.sourceMode === "verified-snapshot" ||
              (key === "macro" &&
                ["tga", "reserves", "rrp"].some(
                  (k) => data.macro?.[k]?.sourceMode === "verified-snapshot",
                ))
            ? "Copia verificada de FRED"
            : "Consulta correcta"
        : h?.stale
          ? "Copia antigua"
          : "No disponible",
      h?.ok ? "positive" : "negative",
    );
    cell(tr, key === "macro" ? "Ver fecha de cada serie" : date(latest[key]));
    const copied =
      key === "macro"
        ? ["tga", "reserves", "rrp"]
            .map((k) => data.macro?.[k]?.sourceFetchedAt)
            .filter(Boolean)
            .sort()[0]
        : h?.sourceFetchedAt;
    cell(tr, `${time(h?.at)}${copied ? " · FRED: " + time(copied) : ""}`);
    $("sourceRows").append(tr);
  }
}
async function refresh() {
  if (busy) return;
  busy = true;
  $("refresh").disabled = true;
  text("refresh", "Consultando…");
  text("status", "Consultando fuentes…");
  const end = day(new Date()),
    start = day(Date.now() - (prefs.range + 160) * 86400000);
  await Promise.allSettled([
    source("quote", "/api/market?kind=quote", (r) => {
      if (!Number.isFinite(r.price) || r.price <= 0)
        throw new Error("Precio inválido");
      return r;
    }),
    source("history", `/api/market?kind=history&days=${prefs.range}`, (r) => {
      if (!r.candles?.length) throw new Error("Sin velas");
      return r;
    }),
    source(
      "sofr",
      `/api/nyfed?kind=sofr_search&startDate=${start}&endDate=${end}`,
      (r) => {
        const rows = (r.refRates || [])
          .filter((x) => number(x.percentRate) != null)
          .map((x) => ({ date: x.effectiveDate, value: Number(x.percentRate) }))
          .sort((a, b) => a.date.localeCompare(b.date));
        if (!rows.length) throw new Error("Sin tasas");
        return rows;
      },
    ),
    source(
      "iorb",
      `/api/iorb?cosd=${start}&coed=${end}`,
      (text) => {
        const rows = csvSeries(text, "IORB");
        if (!rows.length) throw new Error("Sin tasas");
        return rows;
      },
      "text",
    ),
    source("macro", "/api/macro"),
  ]);
  if (Date.now() - liveAt >= 60000) quote = data.quote;
  try {
    renderQuote();
    renderRates();
    renderHistory();
    renderMacro();
    renderSources();
    renderRisk();
    lastRefresh = Date.now();
    text("lastUpdated", `Última consulta: ${time(lastRefresh)}`);
    text(
      "status",
      Object.values(health).every((h) => h.ok)
        ? "Fuentes consultadas"
        : "Datos parciales",
    );
    $("status").classList.toggle(
      "error",
      Object.values(health).some((h) => !h.ok),
    );
  } catch (e) {
    console.error(e);
    toast(
      "No se ha podido completar la vista. Revisa las fuentes y vuelve a actualizar.",
    );
  } finally {
    busy = false;
    $("refresh").disabled = false;
    text("refresh", "Actualizar");
  }
}
function beep() {
  try {
    const A = window.AudioContext || window.webkitAudioContext;
    const c = new A(),
      o = c.createOscillator(),
      g = c.createGain();
    g.gain.value = 0.04;
    o.frequency.value = 660;
    o.connect(g);
    g.connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.15);
    o.onended = () => c.close();
  } catch {}
}
function stopLive() {
  clearTimeout(reconnect);
  ws?.close();
  ws = null;
}
function connectLive() {
  if (
    document.hidden ||
    !navigator.onLine ||
    ws?.readyState === WebSocket.OPEN ||
    ws?.readyState === WebSocket.CONNECTING
  )
    return;
  try {
    ws = new WebSocket("wss://ws-feed.exchange.coinbase.com");
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: "subscribe",
          product_ids: ["BTC-USD"],
          channels: ["ticker"],
        }),
      );
    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (
          d.type !== "ticker" ||
          d.product_id !== "BTC-USD" ||
          !Number.isFinite(Number(d.price))
        )
          return;
        liveAt = Date.now();
        quote = {
          price: Number(d.price),
          change24h:
            number(d.open_24h) > 0
              ? (Number(d.price) / Number(d.open_24h) - 1) * 100
              : data.quote?.change24h,
          fetchedAt: d.time || new Date().toISOString(),
        };
        health.quote = { ok: true, at: quote.fetchedAt, stale: false };
        renderQuote();
      } catch {}
    };
    ws.onclose = () => {
      ws = null;
      reconnect = setTimeout(connectLive, 10000);
    };
    ws.onerror = () => ws?.close();
  } catch {
    reconnect = setTimeout(connectLive, 10000);
  }
}
function riskInputs() {
  return Object.fromEntries(
    [
      "equity",
      "riskPct",
      "leverage",
      "entry",
      "stop",
      "target",
      "fees",
      "mmr",
      "extra",
    ].map((k) => [k, number($(k).value)]),
  );
}
function renderRisk() {
  const v = riskInputs();
  position = riskPosition({
    side: $("side").value,
    equity: v.equity,
    risk: v.riskPct,
    leverage: v.leverage,
    entry: v.entry,
    stop: v.stop,
    target: v.target,
    fees: v.fees,
    mmr: v.mmr,
    extra: v.extra,
  });
  const out = $("riskOutput");
  out.replaceChildren();
  $("saveTrade").disabled = !!position.error;
  $("copyRisk").disabled = !!position.error;
  if (position.error) {
    out.append(node("p", position.error, "muted"));
    riskText = "";
    return;
  }
  const metrics = [
    ["Cantidad", `${fmt(position.qty, 6)} BTC`],
    ["Riesgo total al stop", `${fmt(position.budget, 2)} USDT`],
    ["Margen inicial", `${fmt(position.margin, 2)} USDT`],
    ["Beneficio neto al objetivo", `${fmt(position.reward, 2)} USDT`],
    ["Relación beneficio / riesgo", `${fmt(position.rr, 2)} R`],
    [
      "Liquidación estimada",
      position.liq ? usd(position.liq) : "Fuera de rango positivo",
    ],
  ];
  const grid = node("div", null, "risk-details");
  for (const [label, value] of metrics) {
    const s = node("div", null, "stat");
    s.append(node("small", label), node("strong", value));
    grid.append(s);
  }
  out.append(grid);
  out.append(
    node(
      "p",
      `Comisiones estimadas al stop: ${fmt(position.feeCost, 2)} USDT.`,
      "small",
    ),
  );
  if (position.warnings.length)
    out.append(node("p", position.warnings.join(" "), "warnings"));
  riskText = `Escenario ${$("side").value}\nEntrada: ${v.entry} USD\nStop: ${v.stop} USD\nObjetivo: ${v.target} USD\nCantidad: ${position.qty.toFixed(6)} BTC\nRiesgo total: ${position.budget.toFixed(2)} USDT\nMargen inicial: ${position.margin.toFixed(2)} USDT\nApalancamiento: ${v.leverage}x\nLiquidación aproximada: ${position.liq?.toFixed(2) ?? "—"} USD\n${position.warnings.join(" ")}\nCálculo personal; liquidación aproximada, sin financiación ni deslizamiento.`;
}
function renderJournal() {
  const completed = journal.filter((j) => Number.isFinite(j.result));
  text(
    "journalStats",
    `${journal.length} escenarios · ${completed.length} resultados registrados${completed.length ? ` · media ${fmt(completed.reduce((sum, j) => sum + j.result, 0) / completed.length, 2)} R` : ""}.`,
  );
  $("journalRows").replaceChildren();
  for (const j of journal.slice().reverse()) {
    const row = node("tr");
    cell(row, time(j.at));
    cell(row, j.side);
    cell(row, `${fmt(j.entry, 0)} / ${fmt(j.stop, 0)} / ${fmt(j.target, 0)}`);
    cell(row, `${fmt(j.qty, 6)} BTC`);
    const td = node("td");
    const input = node("input");
    input.type = "number";
    input.step = "any";
    input.placeholder = "Pendiente";
    input.value = Number.isFinite(j.result) ? j.result : "";
    input.setAttribute("aria-label", `Resultado R del escenario ${time(j.at)}`);
    input.dataset.journal = j.id;
    td.append(input);
    row.append(td);
    $("journalRows").append(row);
  }
  if (!journal.length) {
    const tr = node("tr"),
      td = node("td", "Aún no hay escenarios guardados.");
    td.colSpan = 5;
    tr.append(td);
    $("journalRows").append(tr);
  }
  $("exportJournal").disabled = !journal.length;
  $("clearJournal").disabled = !journal.length;
}
function savePrefs() {
  storage.set("prefs", prefs);
  text("preferencesFeedback", "Preferencias guardadas en este navegador.");
}
$("refresh").addEventListener("click", refresh);
for (const b of document.querySelectorAll("[data-page]"))
  b.addEventListener("click", () => switchPage(b.dataset.page));
for (const b of document.querySelectorAll("[data-jump]"))
  b.addEventListener("click", () => switchPage(b.dataset.jump));
window.addEventListener("hashchange", () =>
  switchPage(location.hash.slice(1) || "overview"),
);
for (const b of document.querySelectorAll("[data-range]"))
  b.addEventListener("click", () => {
    if (busy) return;
    prefs.range = Number(b.dataset.range);
    savePrefs();
    document
      .querySelectorAll("[data-range]")
      .forEach((btn) =>
        btn.setAttribute(
          "aria-pressed",
          String(Number(btn.dataset.range) === prefs.range),
        ),
      );
    refresh();
  });
$("help").addEventListener("click", () => $("helpDialog").showModal());
$("closeHelp").addEventListener("click", () => $("helpDialog").close());
$("band").value = prefs.band;
$("refreshSeconds").value = prefs.refresh;
$("alerts").checked = prefs.alerts;
$("band").addEventListener("change", () => {
  const n = number($("band").value);
  if (n == null || n < 1 || n > 100 || !Number.isInteger(n)) {
    text("preferencesFeedback", "Introduce una banda entera entre 1 y 100 pb.");
    return;
  }
  prefs.band = n;
  savePrefs();
  renderRates();
  renderHistory();
});
$("refreshSeconds").addEventListener("change", () => {
  prefs.refresh = Number($("refreshSeconds").value);
  savePrefs();
});
$("alerts").addEventListener("change", () => {
  prefs.alerts = $("alerts").checked;
  savePrefs();
  if (prefs.alerts) beep();
});
$("applyManual").addEventListener("click", () => {
  const i = number($("manualIorb").value),
    s = number($("manualSofr").value);
  if ([i, s].some((n) => n != null && (n < 0 || n > 30))) {
    text("manualFeedback", "Introduce tipos entre 0 % y 30 %.");
    return;
  }
  manual = { iorb: i, sofr: s };
  text(
    "manualFeedback",
    i == null && s == null
      ? "Fuentes oficiales activas."
      : "Escenario manual activo; el histórico oficial no cambia.",
  );
  renderRates();
});
$("resetManual").addEventListener("click", () => {
  manual = { iorb: null, sofr: null };
  $("manualIorb").value = "";
  $("manualSofr").value = "";
  text("manualFeedback", "Fuentes oficiales activas.");
  renderRates();
});
$("riskForm").addEventListener("submit", (e) => e.preventDefault());
const savedRisk = storage.get("riskInputs", {});
for (const k of [
  "side",
  "equity",
  "riskPct",
  "leverage",
  "entry",
  "stop",
  "target",
  "fees",
  "mmr",
  "extra",
]) {
  if (savedRisk[k] != null) $(k).value = savedRisk[k];
  $(k).addEventListener("input", () => {
    storage.set(
      "riskInputs",
      Object.fromEntries(
        ["side", ...Object.keys(riskInputs())].map((id) => [id, $(id).value]),
      ),
    );
    renderRisk();
    if (k === "fees") renderHistory();
  });
}
$("usePrice").addEventListener("click", () => {
  if (!quote || Date.now() - Date.parse(quote.fetchedAt) > 120000) {
    toast("La cotización no está actualizada. Consulta las fuentes primero.");
    return;
  }
  $("entry").value = quote.price.toFixed(2);
  $("entry").dispatchEvent(new Event("input"));
});
$("copyRisk").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(riskText);
    toast("Cálculo copiado.");
  } catch {
    toast("El navegador no permite copiar.");
  }
});
$("saveTrade").addEventListener("click", () => {
  if (position?.error) return;
  const v = riskInputs();
  journal.push({
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    side: $("side").value,
    ...v,
    qty: position.qty,
    result: null,
  });
  if (journal.length > 500) journal = journal.slice(-500);
  storage.set("journal", journal);
  renderJournal();
  toast("Escenario guardado en el diario local.");
});
$("journalRows").addEventListener("change", (e) => {
  if (!e.target.dataset.journal) return;
  const j = journal.find((j) => j.id === e.target.dataset.journal);
  if (j) {
    j.result = number(e.target.value);
    storage.set("journal", journal);
    renderJournal();
  }
});
$("clearJournal").addEventListener("click", () => {
  if (
    !confirm(
      "¿Vaciar el diario local? Exporta una copia antes si quieres conservarlo.",
    )
  )
    return;
  journal = [];
  storage.set("journal", journal);
  renderJournal();
  toast("Diario vaciado.");
});
$("exportJournal").addEventListener("click", () =>
  download("diario-liquidez.csv", [
    [
      "fecha",
      "escenario",
      "entrada_usd",
      "stop_usd",
      "objetivo_usd",
      "cantidad_btc",
      "resultado_R",
    ],
    ...journal.map((j) => [
      j.at,
      j.side,
      j.entry,
      j.stop,
      j.target,
      j.qty,
      j.result,
    ]),
  ]),
);
$("export").addEventListener("click", () => {
  const { rows } = rates(),
    map = new Map(rows.map((r) => [r.date, r.value]));
  download("btc-sofr-iorb.csv", [
    [
      "fecha_UTC",
      "btc_apertura_USD",
      "btc_maximo_USD",
      "btc_minimo_USD",
      "btc_cierre_USD",
      "sofr_pct_observado",
      "iorb_pct_vigente",
      "spread_pb_observado",
    ],
    ...displayCandles().map((c) => [
      c.date,
      c.o,
      c.h,
      c.l,
      c.c,
      data.sofr?.find((s) => s.date === c.date)?.value,
      atDate(data.iorb || [], c.date)?.value,
      map.get(c.date),
    ]),
  ]);
});
$("exportTrades").addEventListener("click", () =>
  download("simulacion-liquidez.csv", [
    [
      "fecha_entrada",
      "fecha_salida",
      "escenario",
      "entrada_USD",
      "salida_USD",
      "resultado_neto_R",
      "motivo",
      "banda_pb",
      "comision_roundtrip_pb",
    ],
    ...(currentSimulation?.trades || []).map((t) => [
      t.date,
      t.exitDate,
      t.side,
      t.entry,
      t.exit,
      t.netR,
      t.reason,
      prefs.band,
      number($("fees").value) ?? 12,
    ]),
  ]),
);
$("clearCache").addEventListener("click", () => {
  for (const k of ["quote", "history", "sofr", "iorb", "macro"])
    storage.remove("cache:" + k);
  location.reload();
});
document
  .querySelectorAll("[data-range]")
  .forEach((b) =>
    b.setAttribute(
      "aria-pressed",
      String(Number(b.dataset.range) === prefs.range),
    ),
  );
renderRisk();
renderJournal();
switchPage(location.hash.slice(1) || "overview");
refresh();
connectLive();
setInterval(async () => {
  if (document.hidden || busy) return;
  const remaining = Math.max(
    0,
    prefs.refresh - Math.floor((Date.now() - lastRefresh) / 1000),
  );
  text(
    "refreshNote",
    `Próxima consulta en ${Math.floor(remaining / 60)} min ${remaining % 60} s · BTC ${Date.now() - liveAt < 60000 ? "en directo" : "por consulta"}`,
  );
  if (lastRefresh && remaining === 0) refresh();
  if (quote && Date.now() - liveAt >= 60000) renderQuote();
}, 1000);
setInterval(async () => {
  if (document.hidden || busy || Date.now() - liveAt < 60000) return;
  await source("quote", "/api/market?kind=quote");
  quote = data.quote;
  renderQuote();
  renderSources();
  renderRates();
}, 60000);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    stopLive();
  } else {
    connectLive();
    if (Date.now() - lastRefresh > 60000) refresh();
  }
});
window.addEventListener("online", () => {
  connectLive();
  refresh();
});
window.addEventListener("offline", () => {
  text("status", "Sin conexión");
  $("status").classList.add("error");
  toast("Sin conexión. Las fechas de los datos siguen visibles.");
});
if ("serviceWorker" in navigator)
  navigator.serviceWorker
    .register(`./sw.js?v=${VERSION}`)
    .then((reg) => reg.update())
    .catch(() => {});
