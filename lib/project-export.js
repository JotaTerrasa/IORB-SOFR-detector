export function projectExportRows(projects, failed = false) {
  const sources = projects?.sources || {},
    rows = [];
  const add = (project, metric, value, unit, period, observed, key) => {
    if (!Number.isFinite(value)) return;
    const source = sources[key];
    rows.push([
      project,
      metric,
      value,
      unit,
      period,
      observed || "",
      source?.fetchedAt || "",
      source?.error || failed
        ? "copia: consulta fallida"
        : Date.now() - Date.parse(source?.fetchedAt) > 86400000
          ? "copia: más de 24 h"
          : "consultado",
    ]);
  };
  for (const key of ["aster", "pump"])
    for (const r of sources[key]?.value?.rows || [])
      add(key, "TVL", r.value, "USD", "diario", r.date, key);
  for (const [key, metric] of [
    ["fees", "comisiones"],
    ["revenue", "ingresos"],
    ["volume", "volumen spot"],
  ])
    for (const p of sources[key]?.value || [])
      for (const [field, window] of [
        ["total24h", "24 h"],
        ["total7d", "7 d"],
      ])
        add(p.name || p.slug, metric, p[field], "USD", window, "", key);
  for (const r of sources.stonkDaily?.value?.rows || []) {
    if (r.date >= new Date().toISOString().slice(0, 10)) continue;
    for (const [field, label, unit] of [
      ["revenue", "ingresos oficiales", "USD"],
      ["buybacks", "recompras", "USD"],
      ["burned", "quemas", "tokens"],
    ])
      add(
        "STONK",
        label,
        r[field],
        unit,
        "día UTC cerrado",
        r.date,
        "stonkDaily",
      );
  }
  return [
    [
      "proyecto",
      "métrica",
      "valor",
      "unidad",
      "ventana",
      "observación",
      "consulta fuente UTC",
      "estado",
    ],
    ...rows,
  ];
}
export function csvText(rows) {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            let text = String(value ?? "");
            if (typeof value === "string" && /^[\s]*[=+@-]/.test(text))
              text = "'" + text;
            return '"' + text.replaceAll('"', '""') + '"';
          })
          .join(";"),
      )
      .join("\r\n")
  );
}
