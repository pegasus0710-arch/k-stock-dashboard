// api/kiwoom.js — Vercel Serverless → EC2 키움 중계 서버 프록시

const KIWOOM_SERVER = process.env.KIWOOM_SERVER_URL || "http://3.38.37.78:3001";

async function relay(endpoint, body, res) {
  try {
    const response = await fetch(`${KIWOOM_SERVER}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error(`[kiwoom proxy] ${endpoint}:`, err.message);
    return res.status(500).json({ error: err.message, endpoint });
  }
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const { type, code, period, tic, inds_cd } = req.query;

  // ─── 종목 현재가 (ka10001) ───────────────────────────────────────
  // GET /api/kiwoom?type=price&code=005930
  if (type === "price") {
    if (!code) return res.status(400).json({ error: "code required" });
    return relay("/price", { stk_cd: code }, res);
  }

  // ─── 호가 (ka10004) ─────────────────────────────────────────────
  // GET /api/kiwoom?type=hoga&code=005930
  if (type === "hoga") {
    if (!code) return res.status(400).json({ error: "code required" });
    return relay("/hoga", { stk_cd: code }, res);
  }

  // ─── 종목 차트 (ka10080/81/82/83/94) ────────────────────────────
  // GET /api/kiwoom?type=stock-chart&code=005930&period=day
  // GET /api/kiwoom?type=stock-chart&code=005930&period=min&tic=5
  if (type === "stock-chart") {
    if (!code) return res.status(400).json({ error: "code required" });
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return relay("/chart/stock", {
      stk_cd: code,
      period: period || "day",
      tic_scope: tic || "5",
      base_dt: today,
    }, res);
  }

  // ─── 업종(지수) 차트 (ka20005/06/07/08/19) ──────────────────────
  // GET /api/kiwoom?type=index-chart&inds_cd=001&period=day
  // GET /api/kiwoom?type=index-chart&inds_cd=001&period=min&tic=5
  if (type === "index-chart") {
    const cd = inds_cd || code || "001";
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    return relay("/chart/index", {
      inds_cd: cd,
      period: period || "day",
      tic_scope: tic || "5",
      base_dt: today,
    }, res);
  }

  // ─── 업종 현재가 (ka20001) ───────────────────────────────────────
  // GET /api/kiwoom?type=index-price&inds_cd=001
  if (type === "index-price") {
    const cd = inds_cd || "001";
    const mrkt = cd.startsWith("1") ? "1" : "0"; // 1xx = KOSDAQ
    return relay("/index/price", { inds_cd: cd, mrkt_tp: mrkt }, res);
  }

  return res.status(400).json({
    error: "Invalid type",
    valid: ["price", "hoga", "stock-chart", "index-chart", "index-price"],
  });
}
