from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx, os
from dotenv import load_dotenv
from datetime import datetime, timedelta

load_dotenv()

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

KIWOOM_BASE  = "https://api.kiwoom.com"
APP_KEY      = os.getenv("KIWOOM_APP_KEY")
APP_SECRET   = os.getenv("KIWOOM_APP_SECRET")
_token_cache = {"token": None, "expires_at": 0}


async def get_token():
    now = datetime.now().timestamp()
    if _token_cache["token"] and now < _token_cache["expires_at"]:
        return _token_cache["token"]
    async with httpx.AsyncClient() as client:
        r = await client.post(
            f"{KIWOOM_BASE}/oauth2/token",
            json={"grant_type": "client_credentials", "appkey": APP_KEY, "secretkey": APP_SECRET},
            headers={"Content-Type": "application/json;charset=UTF-8"},
            timeout=10,
        )
        data  = r.json()
        token = data.get("token") or data.get("access_token")
        if not token:
            raise HTTPException(status_code=500, detail=f"Token error: {data}")
        _token_cache["token"]      = token
        _token_cache["expires_at"] = now + 79200
        return token


def parse_price(val) -> float:
    if not val:
        return 0.0
    try:
        return float(str(val).replace(",", ""))
    except:
        return 0.0


def index_to_float(val) -> float:
    v = parse_price(val)
    return round(v / 100, 2) if v != 0 else 0.0


async def kiwoom_post(api_id: str, url_path: str, body: dict) -> dict:
    token = await get_token()
    headers = {
        "Content-Type": "application/json;charset=UTF-8",
        "Authorization": f"Bearer {token}",
        "api-id": api_id,
    }
    async with httpx.AsyncClient() as client:
        r = await client.post(f"{KIWOOM_BASE}{url_path}", json=body, headers=headers, timeout=15)
        return r.json()


def make_label(t: str, period: str) -> str:
    if period == "min":
        return f"{t[8:10]}:{t[10:12]}" if len(t) >= 12 else t
    elif period == "year":
        return t[:4] if len(t) == 8 else t          # 2023
    elif period == "month":
        return f"{t[2:4]}/{t[4:6]}" if len(t) == 8 else t   # 23/01
    else:
        return f"{t[4:6]}/{t[6:8]}" if len(t) == 8 else t   # 03/26


def prev_biz_day(dt: datetime, n: int = 1) -> datetime:
    result, cnt = dt, 0
    while cnt < n:
        result -= timedelta(days=1)
        if result.weekday() < 5:
            cnt += 1
    return result


def build_stock_candle(r: dict, period: str):
    c   = parse_price(r.get("cur_prc",   "0"))
    o   = parse_price(r.get("open_pric", "0"))
    h   = parse_price(r.get("high_pric", "0"))
    l   = parse_price(r.get("low_pric",  "0"))
    vol = parse_price(r.get("trde_qty",  "0"))
    t   = r.get("cntr_tm", "") if period == "min" else r.get("dt", "")
    close = abs(c)
    if close == 0:
        return None
    return {
        "time":   t,
        "label":  make_label(t, period),
        "open":   abs(o) or close,
        "high":   abs(h) or close,
        "low":    abs(l) or close,
        "close":  close,
        "volume": abs(vol),
        "change": parse_price(r.get("pred_pre", "0")),
    }


def build_index_candle(r: dict, period: str):
    c   = index_to_float(r.get("cur_prc",   "0"))
    o   = index_to_float(r.get("open_pric", "0"))
    h   = index_to_float(r.get("high_pric", "0"))
    l   = index_to_float(r.get("low_pric",  "0"))
    vol = parse_price(r.get("trde_qty", "0"))
    t   = r.get("cntr_tm", "") if period == "min" else r.get("dt", "")
    close = abs(c)
    if close == 0:
        return None
    return {
        "time":   t,
        "label":  make_label(t, period),
        "open":   abs(o) or close,
        "high":   abs(h) or close,
        "low":    abs(l) or close,
        "close":  close,
        "volume": abs(vol),
        "change": index_to_float(r.get("pred_pre", "0")),
    }


# ── 현재가 ────────────────────────────────────
@app.post("/price")
async def get_price(request: Request):
    body  = await request.json()
    data  = await kiwoom_post("ka10001", "/api/dostk/stkinfo", {"stk_cd": body.get("stk_cd", "")})
    return {
        "stk_cd":     data.get("stk_cd"),
        "stk_nm":     data.get("stk_nm"),
        "cur_prc":    parse_price(data.get("cur_prc",    "0")),
        "pred_pre":   parse_price(data.get("pred_pre",   "0")),
        "flu_rt":     parse_price(data.get("flu_rt",     "0")),
        "trde_qty":   parse_price(data.get("trde_qty",   "0")),
        "open_pric":  parse_price(data.get("open_pric",  "0")),
        "high_pric":  parse_price(data.get("high_pric",  "0")),
        "low_pric":   parse_price(data.get("low_pric",   "0")),
        "per":        data.get("per",  ""),
        "pbr":        data.get("pbr",  ""),
        "eps":        data.get("eps",  ""),
        "roe":        data.get("roe",  ""),
        "mac":        data.get("mac",  ""),
        "for_exh_rt": data.get("for_exh_rt", ""),   # 외국인 보유비율
        "dstr_rt":    data.get("dstr_rt",    ""),
        "raw": data,
    }


# ── 호가 ─────────────────────────────────────
@app.post("/hoga")
async def get_hoga(request: Request):
    body = await request.json()
    return await kiwoom_post("ka10004", "/api/dostk/mrkcond", {"stk_cd": body.get("stk_cd")})


# ── 종목 차트 ──────────────────────────────────
STOCK_CHART_API = {
    "min":   ("ka10080", "stk_min_pole_chart_qry"),
    "day":   ("ka10081", "stk_dt_pole_chart_qry"),
    "week":  ("ka10082", "stk_wk_pole_chart_qry"),
    "month": ("ka10083", "stk_mth_pole_chart_qry"),
    "year":  ("ka10094", "stk_yr_pole_chart_qry"),
}


@app.post("/chart/stock")
async def get_stock_chart(request: Request):
    body      = await request.json()
    stk_cd    = body.get("stk_cd",   "")
    period    = body.get("period",   "day")
    tic_scope = str(body.get("tic_scope", "5"))
    base_dt   = body.get("base_dt",  datetime.now().strftime("%Y%m%d"))
    min_days  = int(body.get("min_days", 1))

    api_id, data_key = STOCK_CHART_API.get(period, STOCK_CHART_API["day"])
    all_rows: list   = []

    if period == "min" and min_days > 1:
        base = datetime.strptime(base_dt, "%Y%m%d")
        for i in range(min_days):
            dt = base if i == 0 else prev_biz_day(base, i)
            try:
                d = await kiwoom_post(api_id, "/api/dostk/chart", {
                    "stk_cd": stk_cd, "tic_scope": tic_scope,
                    "base_dt": dt.strftime("%Y%m%d"), "upd_stkpc_tp": "1",
                })
                all_rows.extend(d.get(data_key, []))
            except:
                pass
    else:
        req = {"stk_cd": stk_cd, "upd_stkpc_tp": "1", "base_dt": base_dt}
        if period == "min":
            req["tic_scope"] = tic_scope
        d        = await kiwoom_post(api_id, "/api/dostk/chart", req)
        all_rows = d.get(data_key, [])

    candles, seen = [], set()
    for r in all_rows:
        c = build_stock_candle(r, period)
        if c and c["time"] not in seen:
            seen.add(c["time"])
            candles.append(c)

    candles.sort(key=lambda x: x["time"])
    return {"period": period, "stk_cd": stk_cd, "candles": candles}


# ── 업종 차트 ──────────────────────────────────
INDEX_CHART_API = {
    "min":   ("ka20005", "inds_min_pole_qry"),
    "day":   ("ka20006", "inds_dt_pole_qry"),
    "week":  ("ka20007", "inds_wk_pole_qry"),
    "month": ("ka20008", "inds_mth_pole_qry"),
    "year":  ("ka20019", "inds_yr_pole_qry"),
}


@app.post("/chart/index")
async def get_index_chart(request: Request):
    body      = await request.json()
    inds_cd   = body.get("inds_cd",  "001")
    period    = body.get("period",   "day")
    tic_scope = str(body.get("tic_scope", "5"))
    base_dt   = body.get("base_dt",  datetime.now().strftime("%Y%m%d"))
    min_days  = int(body.get("min_days", 1))

    api_id, data_key = INDEX_CHART_API.get(period, INDEX_CHART_API["day"])
    all_rows: list   = []

    if period == "min" and min_days > 1:
        base = datetime.strptime(base_dt, "%Y%m%d")
        for i in range(min_days):
            dt = base if i == 0 else prev_biz_day(base, i)
            try:
                d = await kiwoom_post(api_id, "/api/dostk/chart", {
                    "inds_cd": inds_cd, "tic_scope": tic_scope,
                    "base_dt": dt.strftime("%Y%m%d"),
                })
                all_rows.extend(d.get(data_key, []))
            except:
                pass
    else:
        req = {"inds_cd": inds_cd, "base_dt": base_dt}
        if period == "min":
            req["tic_scope"] = tic_scope
        d        = await kiwoom_post(api_id, "/api/dostk/chart", req)
        all_rows = d.get(data_key, [])

    candles, seen = [], set()
    for r in all_rows:
        c = build_index_candle(r, period)
        if c and c["time"] not in seen:
            seen.add(c["time"])
            candles.append(c)

    candles.sort(key=lambda x: x["time"])
    return {"period": period, "inds_cd": inds_cd, "candles": candles}


# ── 업종 현재가 ────────────────────────────────
@app.post("/index/price")
async def get_index_price(request: Request):
    body    = await request.json()
    inds_cd = body.get("inds_cd", "001")
    mrkt_tp = body.get("mrkt_tp", "0")
    data    = await kiwoom_post("ka20001", "/api/dostk/sect", {"mrkt_tp": mrkt_tp, "inds_cd": inds_cd})
    return {
        "cur_prc":   index_to_float(data.get("cur_prc",   "0")),
        "pred_pre":  index_to_float(data.get("pred_pre",  "0")),
        "flu_rt":    parse_price(data.get("flu_rt",    "0")),
        "open_pric": index_to_float(data.get("open_pric", "0")),
        "high_pric": index_to_float(data.get("high_pric", "0")),
        "low_pric":  index_to_float(data.get("low_pric",  "0")),
        "trde_qty":  parse_price(data.get("trde_qty",  "0")),
        "rising": data.get("rising", "0"),
        "fall":   data.get("fall",   "0"),
        "stdns":  data.get("stdns",  "0"),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now().isoformat()}
