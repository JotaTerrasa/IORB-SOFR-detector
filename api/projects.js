import { begin, fail } from "./_shared.js";
import { collectProjects } from "./_desk-data.js";
import { readSnapshot } from "./_snapshot.js";
let copy,
  at = 0;
export default async function handler(req, res) {
  if (!begin(req, res, "projects")) return;
  try {
    if (!copy || Date.now() - at > 300000) {
      let old = {};
      try {
        old = await readSnapshot("projects");
      } catch {}
      copy = await collectProjects(old);
      at = Date.now();
    }
    res.status(200).json(copy);
  } catch {
    fail(res);
  }
}
