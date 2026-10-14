import {
  change,
  commonDate,
  yieldDeltaBp,
  finite,
  calendarWindow,
} from "./desk-analytics.js";
const $ = (id) => document.getElementById(id),
  f = (n, d = 2) =>
    Number.isFinite(n)
      ? n.toLocaleString("es-ES", {
          minimumFractionDigits: d,
          maximumFractionDigits: d,
        })
      : "—";
const money = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-ES", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: Math.abs(n) < 1 ? 6 : 2,
      })
    : "—";
const compact = (n) =>
  Number.isFinite(n)
    ? n.toLocaleString("es-ES", {
        notation: "compact",
        maximumFractionDigits: 2,
      }) + " $"
    : "—";
const dt = (s) =>
  s
    ? new Date(s.length === 10 ? s + "T12:00:00Z" : s).toLocaleString("es-ES", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        ...(s.length > 10 ? { hour: "2-digit", minute: "2-digit" } : {}),
      })
    : "—";
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function row(body, values) {
  const r = el("tr");
  for (const v of values) r.append(v instanceof Node ? v : el("td", v));
  body.append(r);
  return r;
}
function link(text, url) {
  const td = el("td"),
    a = el("a", text);
  a.href = url;
  a.target = "_blank";
  a.rel = "noopener";
  td.append(a);
  return td;
}
function state(s) {
  if (!s?.fetchedAt) return "Sin datos";
  if (s.error) return "Copia · consulta fallida";
  if (Date.now() - Date.parse(s.fetchedAt) > 24 * 3600000) return "Copia >24 h";
  return "Consultado " + dt(s.fetchedAt);
}
function pct(n) {
  return Number.isFinite(n) ? (n > 0 ? "+" : "") + f(n) + " %" : "—";
}
let latest,
  drawChart,
  chartsExport = [],
  summaryText = "";
function price(symbol) {
  const p = latest?.sources?.prices?.value?.[symbol];
  return {
    value:
      p &&
      Number.isFinite(p.timestamp) &&
      Math.abs(Date.now() / 1000 - p.timestamp) < 7200 &&
      !latest.sources.prices.error
        ? p.price
        : null,
  };
}
export function initDesk({ chart, toast }) {
  document.querySelectorAll("[data-scroll]").forEach((button) =>
    button.addEventListener("click", () => {
      const target = $(button.dataset.scroll);
      target.scrollIntoView({ behavior: "auto", block: "start" });
      target.focus({ preventScroll: true });
    }),
  );
  $("projectSearch").addEventListener("input", filterActivity);
  $("projectRange").addEventListener("change", () =>
    renderProjects(latest, projectHealth),
  );
  drawChart = chart;
  renderBrief({}, {});
  renderProjectBrief({});
  $("deskCopy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      toast("Parte de mercado copiado.");
    } catch {
      toast("El navegador no permite copiar. Usa Descargar CSV.");
    }
  });
  $("deskExport").addEventListener("click", () =>
    download(
      "mesa-mercado.csv",
      "\uFEFF" +
        [["métrica", "fecha", "valor", "unidad", "fuente"], ...chartsExport]
          .map((r) =>
            r
              .map((x) => '"' + String(x ?? "").replaceAll('"', '""') + '"')
              .join(";"),
          )
          .join("\n"),
      "text/csv;charset=utf-8",
    ),
  );
  $("presentation").addEventListener("click", () => {
    document.body.classList.toggle("presentation");
    $("presentation").textContent = document.body.classList.contains(
      "presentation",
    )
      ? "Salir de presentación"
      : "Modo presentación";
  });
  $("tgaTarget").value = localStorage.getItem("liquidity:v3:tgaTarget") || "";
  $("tgaTarget").addEventListener("input", () => {
    const n = finite($("tgaTarget").value);
    if (n !== null && n > 0)
      localStorage.setItem("liquidity:v3:tgaTarget", String(n));
    else localStorage.removeItem("liquidity:v3:tgaTarget");
    renderTarget();
  });
}
let tgaLast = null;
function renderTarget() {
  const n = finite($("tgaTarget").value);
  $("tgaDistance").textContent =
    n && n > 0 && tgaLast
      ? "Distancia al objetivo personal: " + f(n - tgaLast.value, 1) + " mil M$"
      : "Introduce tu objetivo personal para comparar el saldo.";
}
function download(name, text, type) {
  const a = el("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
export function renderDesk(data, health) {
  const desk = data.desk,
    quotes = data.deskQuotes;
  chartsExport = [];
  const report = ["PARTE DE MERCADO · " + dt(new Date().toISOString())];
  const body = $("deskQuotes");
  body.replaceChildren();
  for (const q of quotes?.rows || []) {
    let delta = q.unit === "%" ? yieldDeltaBp(q.value, q.change) : q.change;
    row(body, [
      q.name,
      f(q.value, q.unit === "USD/EUR" ? 5 : q.unit === "%" ? 3 : 2) +
        " " +
        q.unit,
      Number.isFinite(delta)
        ? (delta > 0 ? "+" : "") + f(delta) + (q.unit === "%" ? " pb" : " %")
        : "—",
      dt(q.sessionAt),
      q.error ||
        ((q.mode || "").includes("900")
          ? "Retraso de 15 min"
          : "Modo de la fuente: " + q.mode),
      link(
        "TradingView",
        "https://www.tradingview.com/symbols/" +
          q.symbol.replace(":", "-") +
          "/",
      ),
    ]);
    report.push(
      `${q.name}: ${f(q.value)} ${q.unit} · sesión ${dt(q.sessionAt)}`,
    );
    chartsExport.push([q.name, q.sessionAt, q.value, q.unit, "TradingView"]);
  }
  $("deskQuoteStatus").textContent = quotes
    ? "Consulta: " +
      dt(quotes.fetchedAt) +
      (health.deskQuotes?.stale || quotes.error
        ? " · COPIA / consulta fallida"
        : "") +
      (quotes.sourceMode === "snapshot" ? " · copia de respaldo" : "") +
      ". La fecha de sesión no es la hora del último tick."
    : "Cotizaciones no disponibles.";
  const series = desk?.series || {},
    b = $("deskMacroRows");
  b.replaceChildren();
  for (const [id, s] of Object.entries(series)) {
    const rows = s.rows || [],
      last = rows.at(-1);
    row(b, [
      s.name || id,
      f(last?.value, s.unit === "%" ? 3 : 2),
      s.unit || "—",
      dt(last?.date),
      f(change(rows)),
      f(change(rows, 5)),
      state(s),
      link(s.source || "Fuente", s.url || "https://fred.stlouisfed.org"),
    ]);
    if (last) {
      report.push(
        `${s.name}: ${f(last.value)} ${s.unit} · ${dt(last.date)}${s.error ? " · consulta fallida" : ""}`,
      );
      chartsExport.push(
        ...rows.map((r) => [s.name, r.date, r.value, s.unit, s.source]),
      );
    }
  }
  $("deskStatus").textContent = desk
    ? "Copia de fuentes públicas: " +
      dt(desk.generatedAt) +
      (desk.snapshotAgeHours > 24 ? " · más de 24 h" : "") +
      (health.desk?.stale ? " · consulta actual fallida" : "") +
      ". Revisa la fecha de cada observación."
    : "No hay copia disponible. Actualiza para reintentar.";
  const t = series.TGA;
  tgaLast = t?.rows?.at(-1) || null;
  $("dailyTga").textContent = tgaLast ? f(tgaLast.value, 1) + " mil M$" : "—";
  $("dailyTgaDate").textContent = "Cierre publicado: " + dt(tgaLast?.date);
  renderTarget();
  const ids = ["DGS2", "DGS10", "DGS20", "DGS30"],
    cd = commonDate(ids.map((id) => series[id]?.rows));
  drawChart(
    "curveChart",
    ["2 años", "10 años", "20 años", "30 años"],
    [
      {
        label: "Curva nominal · %",
        data: ids.map(
          (id) => series[id]?.rows?.find((r) => r.date === cd)?.value ?? null,
        ),
        borderColor: "#73cbd4",
      },
    ],
    { y: { title: { display: true, text: "Rendimiento %" } } },
  );
  $("curveDate").textContent =
    "Fecha común: " + dt(cd) + " · FRED, cierre diario";
  const ri = ["DGS10", "DFII10", "T10YIE"],
    rd = commonDate(ri.map((id) => series[id]?.rows));
  const rr = series.DGS10?.rows?.filter((x) => x.date <= rd).slice(-90) || [];
  drawChart(
    "realChart",
    rr.map((r) => r.date),
    ri.map((id, i) => ({
      label: series[id]?.name || id,
      data: rr.map(
        (r) => series[id]?.rows?.find((x) => x.date === r.date)?.value ?? null,
      ),
      borderColor: ["#73cbd4", "#eab86b", "#b6a1e2"][i],
    })),
    { y: { title: { display: true, text: "% anual" } } },
  );
  $("realDate").textContent =
    "Hasta " +
    dt(rd) +
    ". Breakeven = compensación de inflación de mercado; incluye primas de riesgo.";
  const tr = t?.rows?.slice(-90) || [];
  drawChart(
    "tgaDailyChart",
    tr.map((r) => r.date),
    [
      {
        label: "TGA · cierre diario",
        data: tr.map((r) => r.value),
        borderColor: "#eab86b",
      },
    ],
    { y: { title: { display: true, text: "Miles de millones USD" } } },
  );
  const repo = series.REPO?.rows?.slice(-60) || [];
  drawChart(
    "repoChart",
    repo.map((r) => r.date),
    [
      {
        label: "Repos aceptados · mil M$/día",
        data: repo.map((r) => r.value),
        borderColor: "#b6a1e2",
      },
    ],
  );
  const sr = data.sofr?.at(-1),
    ir = data.iorb?.find((r) => r.date === sr?.date);
  if (sr && ir)
    report.unshift(
      "SOFR " +
        f(sr.value, 3) +
        " % · IORB " +
        f(ir.value, 3) +
        " % · diferencial " +
        f((sr.value - ir.value) * 100, 1) +
        " pb · " +
        dt(sr.date),
    );
  $("deskReading").textContent =
    sr && ir
      ? "Financiación: SOFR − IORB " +
        f((sr.value - ir.value) * 100, 1) +
        " pb. Contrasta este dato con repos, reservas y TGA; la dirección de bonos o divisas por sí sola no determina el movimiento de crypto."
      : "Esperando SOFR e IORB en la misma fecha.";
  summaryText =
    report.join("\n") +
    "\nFuentes: NY Fed, Tesoro, FRED y TradingView. Datos con distintas frecuencias; sin señal automática de compra/venta.";
  renderBrief(data, health);
  renderProjects(data.projects, health.projects);
}
let projectHealth;
function renderProjects(projects, health) {
  projectHealth = health;
  latest = projects;
  const s = projects?.sources || {};
  const b = $("projectRows");
  b.replaceChildren();
  for (const key of ["aster", "pump"]) {
    const p = s[key]?.value;
    row(b, [
      key === "aster" ? "Aster · agregado" : "Pump · agregado",
      compact(p?.tvl),
      dt(p?.rows?.at(-1)?.date),
      state(s[key]),
      link("Ver metodología", "https://defillama.com/protocol/" + key),
    ]);
    const rows = projectWindow(p?.rows || []);
    $(key + "RangeNote").textContent = rows.length
      ? dt(rows[0].date) +
        " — " +
        dt(rows.at(-1).date) +
        " · " +
        rows.length +
        " observaciones publicadas"
      : "Sin observaciones disponibles.";
    drawChart(
      key + "TvlChart",
      rows.map((r) => r.date),
      [
        {
          label: "TVL USD · " + (p?.name || key),
          data: rows.map((r) => r.value),
          borderColor: key === "aster" ? "#73cbd4" : "#eab86b",
        },
      ],
    );
  }
  const chains = $("chainRows");
  chains.replaceChildren();
  for (const name of ["Solana", "Hyperliquid L1"]) {
    row(chains, [
      name,
      compact(s.chains?.value?.find((x) => x.name === name)?.tvl),
      compact(s.stablecoins?.value?.find((x) => x.name === name)?.usd),
      state(s.chains),
      state(s.stablecoins),
    ]);
  }
  const activity = $("activityRows");
  activity.replaceChildren();
  for (const slug of [
    "aster-perps",
    "aster-spot",
    "pump.fun",
    "pumpswap",
    "stonkfun",
  ]) {
    const fee = s.fees?.value?.find((x) => x.slug === slug),
      rev = s.revenue?.value?.find((x) => x.slug === slug),
      vol = s.volume?.value?.find((x) => x.slug === slug);
    row(activity, [
      fee?.name || vol?.name || slug,
      compact(fee?.total24h),
      compact(fee?.total7d),
      compact(rev?.total24h),
      compact(vol?.total24h),
      pct(fee?.change7d),
      state(s.fees),
      link("Metodología", "https://defillama.com/protocol/" + slug),
    ]);
  }
  $("projectStatus").textContent = projects
    ? "Consulta " +
      dt(projects.generatedAt) +
      (health?.stale ? " · copia local, consulta fallida" : "") +
      ". Cada bloque conserva su fecha de consulta."
    : "DeFiLlama no disponible. Actualiza para reintentar.";
  $("projectErrors").textContent = Object.entries(s)
    .filter(([, v]) => v.error)
    .map(([k]) => k + ": consulta fallida; revisa la copia fechada")
    .join(" · ");
  const stonk = s.stonkDaily?.value,
    today = new Date().toISOString().slice(0, 10),
    closed = (stonk?.rows || []).filter((r) => r.date < today),
    last = closed.at(-1),
    partial = stonk?.rows?.find((r) => r.date === today),
    m = s.stonkMarket?.value;
  $("stonkPrice").textContent = money(price("STONK").value);
  $("stonkCap").textContent = compact(m?.marketCap);
  $("stonkBuybacks").textContent = money(last?.buybacks);
  $("stonkBurns").textContent = f(last?.burned, 0) + " tokens";
  $("stonkStatus").textContent =
    "Último día cerrado: " +
    dt(last?.date) +
    " · ingresos/recompras: " +
    state(s.stonkDaily) +
    " · valoración: " +
    state(s.stonkMarket) +
    " · pools: " +
    state(s.stonkPools);
  $("stonkPartial").textContent = partial
    ? "Día UTC en curso (" +
      dt(partial.date) +
      "), incompleto: ingresos " +
      money(partial.revenue) +
      " · recompras " +
      money(partial.buybacks) +
      ". Excluido del gráfico."
    : "Sin dato del día en curso.";
  const visibleStonk = projectWindow(closed);
  $("stonkRangeNote").textContent = visibleStonk.length
    ? dt(visibleStonk[0].date) +
      " — " +
      dt(visibleStonk.at(-1).date) +
      " · solo días UTC cerrados"
    : "Sin días cerrados disponibles.";
  drawChart(
    "stonkRevenueChart",
    projectWindow(closed).map((r) => r.date),
    [
      {
        label: "Ingresos declarados · USD",
        data: projectWindow(closed).map((r) => r.revenue),
        borderColor: "#73cbd4",
      },
      {
        label: "Gasto en recompras · USD",
        data: projectWindow(closed).map((r) => r.buybacks),
        borderColor: "#eab86b",
      },
    ],
  );
  renderProjectBrief(s);
  filterActivity();
  const pb = $("stonkPoolRows");
  pb.replaceChildren();
  for (const p of s.stonkPools?.value || [])
    row(pb, [
      p.dex,
      "STONK / " + p.quote,
      compact(p.liquidity),
      compact(p.volume24h),
      link("Explorar", "https://dexscreener.com/solana/" + p.pair),
    ]);
}

function briefCard(label, value, detail, source) {
  const card = el("article", undefined, "brief-card");
  card.append(
    el("p", label, "eyebrow"),
    el("strong", value),
    el("p", detail, "brief-detail"),
    el("small", source, "muted"),
  );
  return card;
}
function renderBrief(data, health) {
  const s = data.desk?.series || {};
  const date = commonDate([data.sofr, data.iorb]);
  const sofr = data.sofr?.find((r) => r.date === date)?.value;
  const iorb = data.iorb?.find((r) => r.date === date)?.value;
  const spread =
    Number.isFinite(sofr) && Number.isFinite(iorb) ? (sofr - iorb) * 100 : null;
  const tga = s.TGA?.rows || [],
    last = tga.at(-1),
    delta = change(tga);
  const curveDate = commonDate([s.DGS2?.rows, s.DGS10?.rows]);
  const two = s.DGS2?.rows?.find((r) => r.date === curveDate)?.value;
  const ten = s.DGS10?.rows?.find((r) => r.date === curveDate)?.value;
  const curve =
    Number.isFinite(two) && Number.isFinite(ten) ? (ten - two) * 100 : null;
  const repo = s.REPO?.rows?.at(-1);
  const copied = health.desk?.stale ? " · copia de respaldo" : "";
  $("marketBrief").replaceChildren(
    briefCard(
      "01 / Financiación",
      f(spread, 1) + " pb",
      "SOFR − IORB · tasas de la misma fecha",
      dt(date) +
        (health.sofr?.stale || health.iorb?.stale
          ? " · copia de respaldo"
          : ""),
    ),
    briefCard(
      "02 / Curva 10 − 2 años",
      f(curve, 1) + " pb",
      curve === null
        ? "Sin cierres comunes"
        : curve < 0
          ? "Curva invertida entre 2 y 10 años"
          : "Tipo a 10 años por encima o igual al de 2 años",
      dt(curveDate) + " · FRED" + copied,
    ),
    briefCard(
      "03 / Tesoro · TGA",
      f(last?.value, 1) + " mil M$",
      "Δ último cierre: " + (delta > 0 ? "+" : "") + f(delta, 1) + " mil M$",
      dt(last?.date) + " · Tesoro · " + state(s.TGA) + copied,
    ),
    briefCard(
      "04 / Repos aceptados",
      f(repo?.value, 2) + " mil M$",
      "Total aceptado en la última fecha publicada",
      dt(repo?.date) + " · NY Fed · " + state(s.REPO) + copied,
    ),
  );
}
function projectWindow(rows) {
  return calendarWindow(rows, $("projectRange").value);
}
function renderProjectBrief(s) {
  const sol = s.stablecoins?.value?.find((x) => x.name === "Solana");
  const hyper = s.stablecoins?.value?.find((x) => x.name === "Hyperliquid L1");
  $("projectBrief").replaceChildren(
    briefCard(
      "Aster / TVL",
      compact(s.aster?.value?.tvl),
      "Capital bloqueado · agregado",
      dt(s.aster?.value?.rows?.at(-1)?.date) + " · " + state(s.aster),
    ),
    briefCard(
      "Pump / TVL",
      compact(s.pump?.value?.tvl),
      "Capital bloqueado · agregado",
      dt(s.pump?.value?.rows?.at(-1)?.date) + " · " + state(s.pump),
    ),
    briefCard(
      "Solana / Stablecoins",
      compact(sol?.usd),
      "Valor USD de las stablecoins en la red",
      state(s.stablecoins),
    ),
    briefCard(
      "Hyperliquid / Stablecoins",
      compact(hyper?.usd),
      "Valor USD de las stablecoins en la red",
      state(s.stablecoins),
    ),
  );
}
function filterActivity() {
  const term = $("projectSearch").value.trim().toLocaleLowerCase("es");
  const rows = [...$("activityRows").rows];
  let count = 0;
  for (const row of rows) {
    row.hidden = !row.cells[0].textContent
      .toLocaleLowerCase("es")
      .includes(term);
    if (!row.hidden) count++;
  }
  $("activityCount").textContent = count
    ? `${count} de ${rows.length} productos · un guion indica dato no disponible`
    : "No hay productos que coincidan. Prueba con otro nombre.";
}
