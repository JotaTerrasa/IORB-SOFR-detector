import { begin, fail } from "./_shared.js";
import { collectQuotes } from "./_desk-data.js";
import { readSnapshot } from "./_snapshot.js";
let copy,
  at = 0;
export default async function handler(req, res) {
  if (!begin(req, res, "quotes")) return;
  try {
    if (!copy || Date.now() - at > 60000) {
      copy = await collectQuotes();
      at = Date.now();
    }
    res.status(200).json({ ...copy, sourceMode: "direct" });
  } catch {
    try {
      const s = await readSnapshot("desk");
      res.status(200).json({
        ...s.quotes,
        sourceMode: "snapshot",
        error: "Consulta de cotizaciones fallida",
      });
    } catch {
      fail(res);
    }
  }
}
