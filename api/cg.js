// Retired in v2: prices and genuine daily OHLC now come from one spot market.
export default function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  res
    .status(410)
    .json({ error: "Este endpoint se ha sustituido por /api/market." });
}
