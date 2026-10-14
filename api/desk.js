import { begin, fail } from "./_shared.js";
import { readSnapshot } from "./_snapshot.js";
export default async function handler(req, res) {
  if (!begin(req, res, "desk")) return;
  try {
    res.status(200).json(await readSnapshot("desk"));
  } catch {
    fail(res);
  }
}
