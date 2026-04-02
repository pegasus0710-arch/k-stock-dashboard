// src/components/FinancialChart.jsx
// 재무제표 팝업 — 키움 ka10001 basicInfo 기반 (단일 시점)
// + 네이버 금융 링크 제공

function fmt(v) {
  if (v == null || v === "" || v === "0") return "-"
  const n = Number(String(v).replace(/,/g, ""))
  if (isNaN(n) || n === 0) return "-"
  if (Math.abs(n) >= 10000) return (n / 10000).toFixed(1) + "조"
  return n.toLocaleString() + "억"
}

function fmtPct(v) {
  if (v == null || v === "" || v === "0") return "-"
  const n = Number(String(v).replace(/,/g, ""))
  if (isNaN(n) || n === 0) return "-"
  return (n > 0 ? "+" : "") + n.toFixed(1) + "%"
}

function fmtNum(v, suffix="") {
  if (v == null || v === "" || v === "0") return "-"
  const n = Number(String(v).replace(/,/g, ""))
  if (isNaN(n) || n === 0) return "-"
  return n.toLocaleString() + suffix
}

function GaugeRow({ label, value, max, color="#3b82f6" }) {
  const n = Number(String(value || "0").replace(/,/g, ""))
  if (!isFinite(n) || n === 0) return null
  const pct = Math.min(100, Math.abs(n) / max * 100)
  const isNeg = n < 0
  return (
    <div style={{marginBottom:10}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
        <span style={{fontSize:11,color:"var(--text-dim)"}}>{label}</span>
        <span style={{fontSize:12,fontWeight:700,color:isNeg?"#ef4444":color}}>
          {isNeg?"-":""}{fmt(Math.abs(n))}
        </span>
      </div>
      <div style={{height:5,background:"var(--border)",borderRadius:3,overflow:"hidden"}}>
        <div style={{height:"100%",width:`${pct}%`,background:isNeg?"#ef4444":color,borderRadius:3,transition:"width .4s"}}/>
      </div>
    </div>
  )
}

export default function FinancialChart({ stock, onClose }) {
  const info = stock?.basicInfo

  const mac    = Number(String(info?.mac     ||"0").replace(/,/g,""))
  const saleAmt= Number(String(info?.sale_amt||"0").replace(/,/g,""))
  const busPro = Number(String(info?.bus_pro ||"0").replace(/,/g,""))
  const cupNga = Number(String(info?.cup_nga ||"0").replace(/,/g,""))
  const per    = Number(String(info?.per     ||"0").replace(/,/g,""))
  const pbr    = Number(String(info?.pbr     ||"0").replace(/,/g,""))
  const eps    = Number(String(info?.eps     ||"0").replace(/,/g,""))
  const roe    = Number(String(info?.roe     ||"0").replace(/,/g,""))
  const bps    = Number(String(info?.bps     ||"0").replace(/,/g,""))
  const ev     = Number(String(info?.ev      ||"0").replace(/,/g,""))
  const opm    = saleAmt > 0 ? (busPro / saleAmt * 100) : 0
  const npm    = saleAmt > 0 ? (cupNga / saleAmt * 100) : 0
  const maxIncome = Math.max(Math.abs(saleAmt), Math.abs(busPro), Math.abs(cupNga), 1)

  return (
    <div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center"}}
      onClick={onClose}>
      <div style={{width:520,maxHeight:"80vh",borderRadius:12,background:"var(--bg-panel)",boxShadow:"0 20px 60px rgba(0,0,0,0.3)",display:"flex",flexDirection:"column",overflow:"hidden"}}
        onClick={e=>e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"14px 16px",borderBottom:"1px solid var(--border)"}}>
          <div>
            <span style={{fontSize:15,fontWeight:800,color:"var(--text-primary)"}}>📈 {stock?.name}</span>
            <span style={{fontSize:12,color:"var(--text-dim)",marginLeft:8}}>{stock?.code} 재무현황</span>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <a href={`https://finance.naver.com/item/main.naver?code=${stock?.code}`} target="_blank" rel="noreferrer"
              style={{fontSize:11,color:"var(--accent-mid)",textDecoration:"none",padding:"4px 10px",border:"1px solid var(--accent-mid)",borderRadius:6}}>
              네이버 금융 →
            </a>
            <button onClick={onClose} style={{padding:"4px 8px",background:"none",border:"none",cursor:"pointer",fontSize:18,color:"var(--text-dim)"}}>✕</button>
          </div>
        </div>

        {/* 컨텐츠 */}
        <div style={{flex:1,overflow:"auto",padding:"16px"}}>
          {!info ? (
            <div style={{textAlign:"center",padding:32,color:"var(--text-dim)"}}>
              <div style={{fontSize:24,marginBottom:8}}>⏳</div>
              <div style={{fontSize:13}}>종목 정보를 불러오는 중...</div>
            </div>
          ) : (
            <>
              {/* 시가총액 */}
              {mac > 0 && (
                <div style={{background:"var(--bg-base)",borderRadius:8,padding:"10px 14px",marginBottom:14,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <span style={{fontSize:12,color:"var(--text-dim)"}}>시가총액</span>
                  <span style={{fontSize:16,fontWeight:800,color:"var(--text-primary)"}}>
                    {mac >= 10000 ? (mac/10000).toFixed(1)+"조" : mac.toLocaleString()+"억"}
                  </span>
                </div>
              )}

              {/* 손익 게이지 */}
              {(saleAmt>0||busPro!==0||cupNga!==0) && (
                <div style={{marginBottom:16}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",marginBottom:8}}>📊 손익 현황 (최근 결산)</div>
                  <GaugeRow label="매출액"    value={info.sale_amt} max={maxIncome} color="#3b82f6"/>
                  <GaugeRow label="영업이익"  value={info.bus_pro}  max={maxIncome} color="#10b981"/>
                  <GaugeRow label="당기순이익" value={info.cup_nga}  max={maxIncome} color="#8b5cf6"/>
                </div>
              )}

              {/* 수익성 */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",marginBottom:8}}>📐 수익성 지표</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                  {[
                    {l:"영업이익률", v: opm!==0?opm.toFixed(1)+"%":"-", c:opm>0?"#10b981":"#ef4444"},
                    {l:"순이익률",   v: npm!==0?npm.toFixed(1)+"%":"-", c:npm>0?"#8b5cf6":"#ef4444"},
                    {l:"ROE",        v: roe!==0?fmtPct(info.roe):"-",   c:roe>0?"#f59e0b":"#ef4444"},
                    {l:"EV/EBITDA",  v: ev!==0?fmtNum(ev):"-",          c:"var(--text-primary)"},
                  ].map(({l,v,c})=>(
                    <div key={l} style={{background:"var(--bg-base)",borderRadius:8,padding:"8px 12px"}}>
                      <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:3}}>{l}</div>
                      <div style={{fontSize:15,fontWeight:800,color:c}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 밸류에이션 */}
              <div style={{marginBottom:16}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",marginBottom:8}}>💎 밸류에이션</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
                  {[
                    {l:"PER", v:per!==0?per.toFixed(1)+"배":"-"},
                    {l:"PBR", v:pbr!==0?pbr.toFixed(2)+"배":"-"},
                    {l:"EPS", v:eps!==0?eps.toLocaleString()+"원":"-"},
                    {l:"BPS", v:bps!==0?bps.toLocaleString()+"원":"-"},
                    {l:"결산월", v:info.setl_mm?info.setl_mm+"월":"-"},
                    {l:"액면가", v:info.fav?fmtNum(info.fav,"원"):"-"},
                  ].map(({l,v})=>(
                    <div key={l} style={{background:"var(--bg-base)",borderRadius:8,padding:"8px 12px"}}>
                      <div style={{fontSize:10,color:"var(--text-dim)",marginBottom:3}}>{l}</div>
                      <div style={{fontSize:13,fontWeight:700,color:"var(--text-primary)"}}>{v}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 기타 */}
              <div style={{borderTop:"1px solid var(--border)",paddingTop:12}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--text-dim)",marginBottom:8}}>📋 기타</div>
                {[
                  ["자본금",      info.cap?fmtNum(info.cap,"억"):"-"],
                  ["상장주식수",  info.flo_stk?Number(String(info.flo_stk).replace(/,/g,"")).toLocaleString()+"주":"-"],
                  ["외국인소진률",info.for_exh_rt?info.for_exh_rt+"%":"-"],
                  ["유통비율",    info.dstr_rt?info.dstr_rt+"%":"-"],
                  ["시총비중",    info.mac_wght?info.mac_wght+"%":"-"],
                ].filter(([,v])=>v&&v!=="-").map(([k,v])=>(
                  <div key={k} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid var(--border-dim)"}}>
                    <span style={{fontSize:11,color:"var(--text-dim)"}}>{k}</span>
                    <span style={{fontSize:12,fontWeight:600,color:"var(--text-primary)"}}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{fontSize:10,color:"var(--text-dim)",marginTop:10,textAlign:"right"}}>출처: 키움 REST API · 최근 결산 기준</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
