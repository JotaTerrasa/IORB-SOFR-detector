import { readFile, writeFile } from "node:fs/promises";
import { collectDesk, collectProjects } from "../api/_desk-data.js";
for (const [name, collect] of [
  ["desk", collectDesk],
  ["projects", collectProjects],
]) {
  const file = new URL(`../data/${name}-snapshot.json`, import.meta.url);
  let old = {};
  try {
    old = JSON.parse(await readFile(file, "utf8"));
  } catch {}
  const next = await collect(old);
  if (name === "desk" && !next.series.TGA?.rows?.length)
    throw Error("TGA obligatorio");
  await writeFile(file, JSON.stringify(next, null, 2) + "\n");
  console.log(
    name,
    next.generatedAt,
    Object.entries(next.series || next.sources)
      .map(([k, v]) => k + (v.error ? " (consulta fallida)" : ""))
      .join(", "),
  );
}
