export function isHorizontalDrag(initial, current, threshold = 8) {
  const dx = Math.abs(current.x - initial.x),
    dy = Math.abs(current.y - initial.y);
  return dx >= threshold && dx > dy;
}
export function touchWindow(
  length,
  start,
  end,
  initial,
  current,
  width,
  anchor,
) {
  if (!initial.length || initial.length !== current.length || width <= 0)
    return [start, end];
  const center = (points) =>
    points.reduce((n, p) => n + p.x, 0) / points.length;
  const distance = (points) =>
    Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
  const factor =
    initial.length === 2
      ? Math.max(1, distance(initial)) / Math.max(1, distance(current))
      : 1;
  const [a, b] = anchoredWindow(length, start, end, factor, anchor);
  return zoomWindow(
    length,
    a,
    b,
    1,
    -(center(current) - center(initial)) / width,
  );
}
export function dateWindow(labels, from, to) {
  return labels.reduce((out, date, i) => {
    if ((!from || date >= from) && (!to || date <= to)) out.push(i);
    return out;
  }, []);
}
export function zoomWindow(length, start, end, factor, shift = 0) {
  if (!length) return [0, -1];
  const size = Math.min(
    length,
    Math.max(Math.min(2, length), Math.round((end - start + 1) * factor)),
  );
  const center = (start + end) / 2 + shift * (end - start + 1);
  const left = Math.max(
    0,
    Math.min(length - size, Math.round(center - (size - 1) / 2)),
  );
  return [left, left + size - 1];
}
export function anchoredWindow(length, start, end, factor, anchor = 0.5) {
  const size = Math.min(
    length,
    Math.max(Math.min(2, length), Math.round((end - start + 1) * factor)),
  );
  const left = Math.max(
    0,
    Math.min(
      length - size,
      Math.round(start + (end - start) * anchor - (size - 1) * anchor),
    ),
  );
  return [left, left + size - 1];
}
const gestures = new WeakMap();
const states = new Map();
export function attachChartRange(id, chart, canvas) {
  gestures.get(canvas)?.abort();
  canvas.classList.remove("chart-interactive", "chart-dragging");
  const labels = [...chart.data.labels];
  if (!labels.length || !labels.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) {
    canvas.parentElement.parentElement
      .querySelector(`[data-range="${id}"]`)
      ?.remove();
    return;
  }
  const series = chart.data.datasets.map((d) => [...d.data]);
  const box = canvas.parentElement;
  let panel = box.parentElement.querySelector(`[data-range="${id}"]`);
  if (!panel) {
    panel = document.createElement("details");
    panel.className = "chart-range";
    panel.dataset.range = id;
    const summary = document.createElement("summary");
    summary.textContent = "Ampliación y fechas";
    panel.append(summary);
    const row = document.createElement("div");
    row.className = "chart-range-controls";
    panel.append(row);
    for (const [name, label] of [
      ["from", "Desde"],
      ["to", "Hasta"],
    ]) {
      const wrapper = document.createElement("label");
      wrapper.textContent = label;
      const input = document.createElement("input");
      input.type = "date";
      input.dataset.bound = name;
      input.setAttribute(
        "aria-label",
        `${label} · ${canvas.getAttribute("aria-label")}`,
      );
      wrapper.append(input);
      row.append(wrapper);
    }
    for (const [action, label] of [
      ["apply", "Aplicar"],
      ["in", "Acercar"],
      ["out", "Alejar"],
      ["prev", "← Anterior"],
      ["next", "Siguiente →"],
      ["reset", "Restablecer"],
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "button ghost";
      button.dataset.action = action;
      button.textContent = label;
      row.append(button);
    }
    const status = document.createElement("p");
    status.className = "muted";
    status.setAttribute("role", "status");
    panel.append(status);
    box.before(panel);
  }
  const from = panel.querySelector('[data-bound="from"]'),
    to = panel.querySelector('[data-bound="to"]'),
    status = panel.querySelector('[role="status"]');
  for (const input of [from, to]) {
    input.min = labels[0];
    input.max = labels.at(-1);
  }
  let active = states.get(id);
  const apply = (a, b) => {
    const indices = dateWindow(labels, a, b);
    if (!indices.length) {
      status.textContent = "No hay observaciones en ese intervalo.";
      return;
    }
    active = [labels[indices[0]], labels[indices.at(-1)]];
    states.set(id, active);
    from.value = active[0];
    to.value = active[1];
    chart.data.labels = indices.map((i) => labels[i]);
    chart.data.datasets.forEach((d, k) => {
      d.data = indices.map((i) => series[k][i]);
    });
    chart.update("none");
    status.textContent = `${active[0]} — ${active[1]} · ${indices.length} observaciones`;
    panel.querySelector('[data-action="prev"]').disabled = indices[0] === 0;
    panel.querySelector('[data-action="next"]').disabled =
      indices.at(-1) === labels.length - 1;
    panel.querySelector('[data-action="in"]').disabled = indices.length <= 2;
    panel.querySelector('[data-action="out"]').disabled =
      indices.length === labels.length;
  };
  panel.onclick = (event) => {
    const action = event.target.closest("button")?.dataset.action;
    if (!action) return;
    if (action === "apply") {
      if (
        !from.value ||
        !to.value ||
        from.value > to.value ||
        !from.checkValidity() ||
        !to.checkValidity()
      ) {
        status.textContent =
          "Elige un intervalo válido dentro del histórico disponible.";
        return;
      }
      apply(from.value, to.value);
    } else if (action === "reset") {
      states.delete(id);
      apply(labels[0], labels.at(-1));
      states.delete(id);
    } else {
      const [a, b] = zoomWindow(
        labels.length,
        labels.indexOf(active[0]),
        labels.indexOf(active[1]),
        action === "in" ? 0.5 : action === "out" ? 2 : 1,
        action === "prev" ? -0.5 : action === "next" ? 0.5 : 0,
      );
      apply(labels[a], labels[b]);
    }
  };
  const controller = new AbortController();
  gestures.set(canvas, controller);
  const options = { signal: controller.signal };
  canvas.classList.add("chart-interactive");
  canvas.title =
    "Rueda o dos dedos: ampliar · Arrastrar: mover fechas · Doble clic: restablecer";
  const position = (event) => {
    const rect = canvas.getBoundingClientRect(),
      area = chart.chartArea;
    const x = ((event.clientX - rect.left) * chart.width) / rect.width;
    const y = ((event.clientY - rect.top) * chart.height) / rect.height;
    return {
      x,
      inside:
        area &&
        x >= area.left &&
        x <= area.right &&
        y >= area.top &&
        y <= area.bottom,
      anchor: area
        ? Math.max(0, Math.min(1, (x - area.left) / (area.right - area.left)))
        : 0.5,
    };
  };
  canvas.addEventListener(
    "wheel",
    (event) => {
      const point = position(event);
      if (!point.inside || !event.deltaY || !active) return;
      event.preventDefault();
      const [a, b] = anchoredWindow(
        labels.length,
        labels.indexOf(active[0]),
        labels.indexOf(active[1]),
        event.deltaY < 0 ? 0.8 : 1.25,
        point.anchor,
      );
      apply(labels[a], labels[b]);
    },
    { ...options, passive: false },
  );
  const pointers = new Map();
  let origin = null;
  const captureOrigin = () => {
    const points = [...pointers.values()];
    if (!points.length) {
      origin = null;
      canvas.classList.remove("chart-dragging");
      return;
    }
    origin = {
      points: points.map((p) => ({ ...p })),
      start: labels.indexOf(active[0]),
      end: labels.indexOf(active[1]),
      anchor: position({
        clientX: points.reduce((n, p) => n + p.x, 0) / points.length,
        clientY: points[0].y,
      }).anchor,
    };
  };
  canvas.addEventListener(
    "pointerdown",
    (event) => {
      if (event.button !== 0 || !position(event).inside || pointers.size >= 2)
        return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      canvas.setPointerCapture(event.pointerId);
      canvas.classList.add("chart-dragging");
      captureOrigin();
    },
    options,
  );
  canvas.addEventListener(
    "pointermove",
    (event) => {
      if (!pointers.has(event.pointerId) || !origin) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (
        event.pointerType === "touch" &&
        pointers.size === 1 &&
        !isHorizontalDrag(origin.points[0], {
          x: event.clientX,
          y: event.clientY,
        })
      )
        return;
      const rect = canvas.getBoundingClientRect();
      const width =
        ((chart.chartArea.right - chart.chartArea.left) * rect.width) /
        chart.width;
      const [a, b] = touchWindow(
        labels.length,
        origin.start,
        origin.end,
        origin.points,
        [...pointers.values()],
        width,
        origin.anchor,
      );
      apply(labels[a], labels[b]);
    },
    options,
  );
  const stop = (event) => {
    if (!pointers.delete(event.pointerId)) return;
    captureOrigin();
  };
  canvas.addEventListener("pointerup", stop, options);
  canvas.addEventListener("pointercancel", stop, options);
  canvas.addEventListener("lostpointercapture", stop, options);
  canvas.addEventListener(
    "dblclick",
    () => {
      apply(labels[0], labels.at(-1));
      states.delete(id);
    },
    options,
  );
  if (active && dateWindow(labels, ...active).length) apply(...active);
  else {
    apply(labels[0], labels.at(-1));
    states.delete(id);
  }
}
