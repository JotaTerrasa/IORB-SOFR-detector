export const calendarSources = {
  fed: {
    title: "Reuniones de la Fed",
    url: "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm",
  },
  cpi: {
    title: "Inflación · CPI",
    url: "https://www.bls.gov/schedule/news_release/cpi.htm",
  },
  jobs: {
    title: "Empleo · NFP",
    url: "https://www.bls.gov/schedule/news_release/empsit.htm",
  },
};
const months = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const clean = (s) =>
  s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
function iso(year, month, day) {
  const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (new Date(date + "T12:00:00Z").toISOString().slice(0, 10) !== date)
    throw Error("Fecha inválida");
  return date;
}
export function parseCalendar(html, key) {
  const rows = [];
  if (key === "fed") {
    const sections = [...html.matchAll(/(\d{4}) FOMC Meetings/g)];
    for (let i = 0; i < sections.length; i++) {
      const year = Number(sections[i][1]);
      const section = html.slice(sections[i].index, sections[i + 1]?.index);
      for (const m of section.matchAll(
        /class="[^"]*fomc-meeting__month[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<div class="[^"]*fomc-meeting__date[^"]*"[^>]*>([\s\S]*?)<\/div>/g,
      )) {
        const names = clean(m[1]).split("/"),
          days = clean(m[2]);
        const d = days.match(/^(\d{1,2})(?:-(\d{1,2}))?(\*)?$/);
        const first = months.indexOf(names[0].slice(0, 3)) + 1,
          last = months.indexOf(names.at(-1).slice(0, 3)) + 1;
        if (!d || !first || !last) continue;
        rows.push({
          start: iso(year, first, Number(d[1])),
          date: iso(year, last, Number(d[2] || d[1])),
          projections: !!d[3],
        });
      }
    }
  } else {
    const table =
      html.match(/<table class="release-list">([\s\S]*?)<\/table>/)?.[1] || "";
    for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
      const cells = [...row[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(
        (x) => clean(x[1]),
      );
      if (cells.length !== 3) continue;
      const d = cells[1].match(/^([A-Za-z]+)\.? (\d{1,2}), (\d{4})$/);
      const month = d && months.indexOf(d[1].slice(0, 3)) + 1;
      if (!d || !month || !/^\d{2}:\d{2} [AP]M$/.test(cells[2])) continue;
      rows.push({
        date: iso(Number(d[3]), month, Number(d[2])),
        period: cells[0],
        time: cells[2],
      });
    }
  }
  if (!rows.length) throw Error("Calendario no reconocido");
  return [...new Map(rows.map((r) => [r.date, r])).values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}
