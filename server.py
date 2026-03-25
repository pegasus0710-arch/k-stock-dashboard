from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
import httpx, os, json
from dotenv import load_dotenv
from datetime import datetime

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

KIWOOM_BASE = "https://api.kiwoom.com"
APP_KEY = os.getenv("KIWOOM_APP_KEY")
APP_SECRET = os.getenv("KIWOOM_APP_SECRET")

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
        data = r.json()
        token = data.get("token") or data.get("access_token")
        if not token:
            raise HTTPException(status_code=500, detail=f"Token error: {data}")
        _token_cache["token"] = token
        _token_cache["expires_at"] = now + 79200  # 22시간
        return token


def parse_price(val: str) -> float:
    """키움 가격 파싱: 부호 포함 문자열 → float. 업종지수는 /100"""
    if not val:
        return 0.0
    try:
        return float(val.replace(",", ""))
    except:
        return 0.0


def index_to_float(val: str) -> float:
    """업종 지수값: 소수점 제거 후 100배 값이므로 /100"""
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
        r = await client.post(
            f"{KIWOOM_BASE}{url_path}",
            json=body,
            headers=headers,
            timeout=15,
        )
        return r.json()


# ─────────────────────────────────────────────
# 현재가 (ka10001) → /api/dostk/stkinfo
# ─────────────────────────────────────────────
@app.post("/price")
async def get_price(request: Request):
    body = await request.json()
    stk_cd = body.get("stk_cd", "")
    data = await kiwoom_post("ka10001", "/api/dostk/stkinfo", {"stk_cd": stk_cd})
    return {
        "stk_cd": data.get("stk_cd"),
        "stk_nm": data.get("stk_nm"),
        "cur_prc": parse_price(data.get("cur_prc", "0")),
        "pred_pre": parse_price(data.get("pred_pre", "0")),
        "flu_rt": parse_price(data.get("flu_rt", "0")),
        "trde_qty": parse_price(data.get("trde_qty", "0")),
        "open_pric": parse_price(data.get("open_pric", "0")),
        "high_pric": parse_price(data.get("high_pric", "0")),
        "low_pric": parse_price(data.get("low_pric", "0")),
        "per": data.get("per", ""),
        "pbr": data.get("pbr", ""),
        "eps": data.get("eps", ""),
        "roe": data.get("roe", ""),
        "mac": data.get("mac", ""),
        "dstr_rt": data.get("dstr_rt", ""),
        "raw": data,
    }


# ─────────────────────────────────────────────
# 호가 (ka10004) → /api/dostk/mrkcond
# ─────────────────────────────────────────────
@app.post("/hoga")
async def get_hoga(request: Request):
    body = await request.json()
    data = await kiwoom_post("ka10004", "/api/dostk/mrkcond", {"stk_cd": body.get("stk_cd")})
    return data


# ─────────────────────────────────────────────
# 종목 차트 (ka10080/81/82/83/94)
# ─────────────────────────────────────────────
STOCK_CHART_API = {
    "min":   ("ka10080", "stk_min_pole_chart_qry"),
    "day":   ("ka10081", "stk_dt_pole_chart_qry"),
    "week":  ("ka10082", "stk_wk_pole_chart_qry"),
    "month": ("ka10083", "stk_mth_pole_chart_qry"),
    "year":  ("ka10094", "stk_yr_pole_chart_qry"),
}


@app.post("/chart/stock")
async def get_stock_chart(request: Request):
    body = await request.json()
    stk_cd = body.get("stk_cd", "")
    period = body.get("period", "day")  # min/day/week/month/year
    tic_scope = str(body.get("tic_scope", "5"))  # 분봉 단위 (1/3/5/10/15/30/60)
    base_dt = body.get("base_dt", datetime.now().strftime("%Y%m%d"))

    api_id, data_key = STOCK_CHART_API.get(period, STOCK_CHART_API["day"])

    req_body = {"stk_cd": stk_cd, "upd_stkpc_tp": "1", "base_dt": base_dt}
    if period == "min":
        req_body["tic_scope"] = tic_scope

    data = await kiwoom_post(api_id, "/api/dostk/chart", req_body)
    rows = data.get(data_key, [])

    candles = []
    for r in rows:
        c = parse_price(r.get("cur_prc", "0"))
        o = parse_price(r.get("open_pric", "0"))
        h = parse_price(r.get("high_pric", "0"))
        l = parse_price(r.get("low_pric", "0"))
        vol = parse_price(r.get("trde_qty", "0"))

        if period == "min":
            t = r.get("cntr_tm", "")  # YYYYMMDDHHmmss
            label = f"{t[8:10]}:{t[10:12]}" if len(t) >= 12 else t
        else:
            t = r.get("dt", "")  # YYYYMMDD
            label = f"{t[4:6]}/{t[6:8]}" if len(t) == 8 else t

        candles.append({
            "time": t,
            "label": label,
            "open": abs(o),
            "high": abs(h),
            "low": abs(l),
            "close": abs(c),
            "volume": abs(vol),
            "change": parse_price(r.get("pred_pre", "0")),
        })

    # 시간순 정렬 (오래된 것 → 최신)
    candles.reverse()
    return {"period": period, "stk_cd": stk_cd, "candles": candles}


# ─────────────────────────────────────────────
# 업종(지수) 차트 (ka20005/06/07/08/19)
# ─────────────────────────────────────────────
INDEX_CHART_API = {
    "min":   ("ka20005", "inds_min_pole_qry"),
    "day":   ("ka20006", "inds_dt_pole_qry"),
    "week":  ("ka20007", "inds_wk_pole_qry"),
    "month": ("ka20008", "inds_mth_pole_qry"),
    "year":  ("ka20019", "inds_yr_pole_qry"),
}


@app.post("/chart/index")
async def get_index_chart(request: Request):
    body = await request.json()
    inds_cd = body.get("inds_cd", "001")   # 001=KOSPI, 101=KOSDAQ
    period = body.get("period", "day")
    tic_scope = str(body.get("tic_scope", "5"))
    base_dt = body.get("base_dt", datetime.now().strftime("%Y%m%d"))

    api_id, data_key = INDEX_CHART_API.get(period, INDEX_CHART_API["day"])

    req_body = {"inds_cd": inds_cd, "base_dt": base_dt}
    if period == "min":
        req_body["tic_scope"] = tic_scope

    data = await kiwoom_post(api_id, "/api/dostk/chart", req_body)
    rows = data.get(data_key, [])

    candles = []
    for r in rows:
        # 업종 지수값은 소수점 제거 후 100배 → /100
        c = index_to_float(r.get("cur_prc", "0"))
        o = index_to_float(r.get("open_pric", "0"))
        h = index_to_float(r.get("high_pric", "0"))
        l = index_to_float(r.get("low_pric", "0"))
        vol = parse_price(r.get("trde_qty", "0"))

        if period == "min":
            t = r.get("cntr_tm", "")
            label = f"{t[8:10]}:{t[10:12]}" if len(t) >= 12 else t
        else:
            t = r.get("dt", "")
            label = f"{t[4:6]}/{t[6:8]}" if len(t) == 8 else t

        candles.append({
            "time": t,
            "label": label,
            "open": abs(o),
            "high": abs(h),
            "low": abs(l),
            "close": abs(c),
            "volume": abs(vol),
            "change": index_to_float(r.get("pred_pre", "0")),
        })

    candles.reverse()
    return {"period": period, "inds_cd": inds_cd, "candles": candles}


# ─────────────────────────────────────────────
# 업종 현재가 (ka20001) → /api/dostk/sect
# ─────────────────────────────────────────────
@app.post("/index/price")
async def get_index_price(request: Request):
    body = await request.json()
    inds_cd = body.get("inds_cd", "001")
    mrkt_tp = body.get("mrkt_tp", "0")  # 0=KOSPI, 1=KOSDAQ
    data = await kiwoom_post("ka20001", "/api/dostk/sect", {"mrkt_tp": mrkt_tp, "inds_cd": inds_cd})
    return {
        "cur_prc": index_to_float(data.get("cur_prc", "0")),
        "pred_pre": index_to_float(data.get("pred_pre", "0")),
        "flu_rt": parse_price(data.get("flu_rt", "0")),
        "open_pric": index_to_float(data.get("open_pric", "0")),
        "high_pric": index_to_float(data.get("high_pric", "0")),
        "low_pric": index_to_float(data.get("low_pric", "0")),
        "trde_qty": parse_price(data.get("trde_qty", "0")),
        "rising": data.get("rising", "0"),
        "fall": data.get("fall", "0"),
        "stdns": data.get("stdns", "0"),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now().isoformat()}
