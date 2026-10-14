import { chartUnit, chartValue, chartDate } from "./lib/chart-format.js";
import { initCalendar } from "./lib/calendar-view.js";
import { initDesk, renderDesk } from "./lib/desk-view.js";
import {
  day,
  number,
  csvSeries,
  atDate,
  correlations,
  liquidity,
  spreadRows,
  staleSofr,
} from "./lib/analytics.js";
const VERSION = "20261014_12",
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
  ws = null,
  reconnect = null,
  liveAt = 0,
  quote = null,
  lastReading = null;
if (![90, 180, 365].includes(prefs.range)) prefs.range = 90;
if (![300, 900, 1800].includes(prefs.refresh)) prefs.refresh = 300;
if (!Number.isFinite(prefs.band) || prefs.band < 1 || prefs.band > 100)
  prefs.band = 5;
let manual = { iorb: null, sofr: null };
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
  if (busy) {
    completedSources++;
    text("status", `Fuentes consultadas: ${completedSources}/8`);
    try {
      if (key === "quote") {
        if (Date.now() - liveAt >= 60000) quote = data.quote;
        renderQuote();
      }
      if (["sofr", "iorb"].includes(key)) renderRates();
      if (["history", "sofr", "iorb"].includes(key)) renderHistory();
      if (key === "macro") renderMacro();
      if (["desk", "deskQuotes", "projects", "sofr", "iorb"].includes(key))
        renderDesk(data, health);
      renderSources();
    } catch (error) {
      console.error(error);
    }
  }
}
function switchPage(id) {
  if (!$(id)?.classList.contains("page")) id = "desk";
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
  const unit = chartUnit(id),
    isBar = id === "repoChart";
  const yScales = Object.keys(scales).length
    ? scales
    : { y: { title: { display: true, text: unit } } };
  const styledScales = Object.fromEntries(
    Object.entries(yScales).map(([key, value]) => [
      key,
      {
        ...value,
        border: { display: false },
        grid: { color: "#8fa6b31a", drawTicks: false, ...value.grid },
        title: {
          display: true,
          color: "#b2c4ce",
          font: { size: 11 },
          ...value.title,
        },
        ticks: {
          color: "#afc0cb",
          font: { size: 11 },
          maxTicksLimit: 6,
          padding: 8,
          callback: (v) => chartValue(v, "", true),
          ...value.ticks,
        },
        ...(isBar ? { beginAtZero: true } : {}),
      },
    ]),
  );
  charts[id] = new Chart($(id), {
    type: isBar ? "bar" : "line",
    data: {
      labels,
      datasets: datasets.map((d, i) => ({
        borderWidth: 2.3,
        pointRadius: id === "curveChart" ? 4 : labels.length < 3 ? 3 : 0,
        pointHoverRadius: 5,
        pointHitRadius: 16,
        tension: 0,
        spanGaps: false,
        borderDash: i === 1 ? [6, 3] : i === 2 ? [2, 3] : [],
        backgroundColor: isBar ? "#b6a1e2aa" : d.borderColor,
        ...(isBar ? { borderRadius: 3, maxBarThickness: 18 } : {}),
        ...d,
      })),
    },
    plugins: [
      {
        id: "emptyChart",
        afterDraw(c) {
          if (
            c.data.datasets.some((d) =>
              d.data.some((v) => v !== null && Number.isFinite(v)),
            )
          )
            return;
          const { ctx, chartArea: a } = c;
          if (!a) return;
          ctx.save();
          ctx.fillStyle = "#afc0cb";
          ctx.font = "13px system-ui";
          ctx.textAlign = "center";
          ctx.fillText(
            "Sin observaciones disponibles",
            (a.left + a.right) / 2,
            (a.top + a.bottom) / 2,
          );
          ctx.restore();
        },
      },
    ],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: 8, right: 8 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: {
          display: datasets.length > 1,
          position: "bottom",
          labels: {
            color: "#c2d0d8",
            usePointStyle: true,
            pointStyle: "line",
            padding: 20,
            font: { size: 11 },
          },
        },
        tooltip: {
          backgroundColor: "#0c151d",
          titleColor: "#ffffff",
          bodyColor: "#e4edf2",
          borderColor: "#48606e",
          borderWidth: 1,
          padding: 12,
          displayColors: true,
          callbacks: {
            title: (items) => chartDate(items[0]?.label),
            label: (ctx) =>
              ctx.dataset.label +
              ": " +
              chartValue(ctx.parsed.y, chartUnit(id, ctx.dataset.yAxisID)),
          },
        },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            color: "#afc0cb",
            maxTicksLimit: 6,
            maxRotation: 0,
            padding: 10,
            font: { size: 11 },
            callback: (v) => chartDate(labels[v], true),
          },
        },
        ...styledScales,
      },
    },
  });
  const canvas = $(id),
    box = canvas.parentElement;
  if (!box.nextElementSibling?.classList.contains("chart-tools")) {
    const tools = node("div", null, "chart-tools");
    const expand = node("button", "Ampliar", "button ghost");
    expand.type = "button";
    expand.setAttribute("aria-pressed", "false");
    expand.setAttribute(
      "aria-label",
      "Ampliar " + canvas.getAttribute("aria-label"),
    );
    expand.addEventListener("click", () => {
      const active = box.classList.toggle("chart-expanded");
      expand.textContent = active ? "Reducir" : "Ampliar";
      expand.setAttribute("aria-pressed", String(active));
      charts[id]?.resize();
    });
    const save = node("button", "Descargar PNG", "button ghost");
    save.type = "button";
    save.setAttribute(
      "aria-label",
      "Descargar PNG de " + canvas.getAttribute("aria-label"),
    );
    save.addEventListener("click", () => {
      const current = charts[id];
      if (!current) return;
      const output = document.createElement("canvas");
      output.width = Math.max(canvas.width, 1000);
      const imageHeight = (canvas.height * output.width) / canvas.width;
      output.height = imageHeight + 160;
      const ctx = output.getContext("2d");
      ctx.fillStyle = "#101820";
      ctx.fillRect(0, 0, output.width, output.height);
      ctx.fillStyle = "#e9f0f3";
      ctx.font = "18px system-ui";
      ctx.fillText(
        canvas.closest("article")?.querySelector("h2")?.textContent ||
          "Market Desk",
        20,
        30,
      );
      ctx.font = "12px system-ui";
      ctx.fillStyle = "#b2c4ce";
      const dates = current.data.labels;
      ctx.fillText(
        id === "curveChart"
          ? $("curveDate").textContent
          : "Periodo mostrado: " +
              chartDate(dates[0]) +
              " — " +
              chartDate(dates.at(-1)),
        20,
        55,
      );
      const provider =
        id === "mainChart"
          ? "Coinbase · NY Fed · FRED"
          : id === "stonkRevenueChart"
            ? "StonkFun · días UTC cerrados"
            : ["asterTvlChart", "pumpTvlChart", "projectCompareChart"].includes(
                  id,
                )
              ? "DeFiLlama · TVL, no rentabilidad del token"
              : id === "tgaDailyChart"
                ? "Tesoro de EE. UU. · saldo al cierre"
                : id === "repoChart"
                  ? "NY Fed · importes diarios aceptados"
                  : "FRED · observaciones publicadas";
      ctx.fillText("Fuente: " + provider, 20, 78);
      ctx.drawImage(canvas, 0, 100, output.width, imageHeight);
      ctx.fillText(
        "Market Desk · " +
          new Date().toLocaleString("es-ES") +
          " · iorb-sofr-detector.vercel.app",
        20,
        output.height - 20,
      );
      output.toBlob((blob) => {
        if (!blob) return;
        const a = node("a"),
          url = URL.createObjectURL(blob);
        a.href = url;
        a.download = id + "-" + day(Date.now()) + ".png";
        document.body.append(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }, "image/png");
    });
    tools.append(expand, save);
    box.after(tools);
  }
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
  $("export").disabled = !candles.length;
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
let completedSources = 0;
async function refresh() {
  if (busy) return;
  busy = true;
  completedSources = 0;
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
    source("desk", "/api/desk"),
    source("deskQuotes", "/api/quotes"),
    source("projects", "/api/projects"),
  ]);
  if (Date.now() - liveAt >= 60000) quote = data.quote;
  try {
    renderQuote();
    renderRates();
    renderHistory();
    renderMacro();
    renderSources();
    renderDesk(data, health);
    lastRefresh = Date.now();
    text("lastUpdated", `Última consulta: ${time(lastRefresh)}`);
    const partialDesk =
      Object.values(data.desk?.series || {}).some((s) => s.error) ||
      Object.values(data.projects?.sources || {}).some((s) => s.error) ||
      data.deskQuotes?.error ||
      data.deskQuotes?.rows?.some((q) => q.error);
    text(
      "status",
      Object.values(health).every((h) => h.ok) && !partialDesk
        ? "Fuentes consultadas"
        : "Datos parciales",
    );
    $("status").classList.toggle(
      "error",
      Object.values(health).some((h) => !h.ok) || !!partialDesk,
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
function savePrefs() {
  storage.set("prefs", prefs);
  text("preferencesFeedback", "Preferencias guardadas en este navegador.");
}
initCalendar();
$("refresh").addEventListener("click", refresh);
for (const b of document.querySelectorAll("[data-page]"))
  b.addEventListener("click", () => switchPage(b.dataset.page));
for (const b of document.querySelectorAll("[data-jump]"))
  b.addEventListener("click", () => switchPage(b.dataset.jump));
window.addEventListener("hashchange", () =>
  switchPage(location.hash.slice(1) || "desk"),
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
$("clearCache").addEventListener("click", () => {
  for (const k of [
    "quote",
    "history",
    "sofr",
    "iorb",
    "macro",
    "desk",
    "deskQuotes",
    "projects",
  ])
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
initDesk({ chart, toast });
switchPage(location.hash.slice(1) || "desk");
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
