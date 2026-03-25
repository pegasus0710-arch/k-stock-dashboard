import { useState, useEffect, useCallback } from 'react'
import './PortfolioPage.css'

const THEME_COLORS = {
  '반도체·AI':'#2563eb','방산':'#dc2626','조선':'#0d9488',
  '원전·전력':'#d97706','2차전지':'#16a34a','바이오':'#7c3aed','밸류업·금융':'#ea580c','기타':'#64748b',
}

function fmt(n) {
  if (!n && n !== 0) return '-'
  return Number(n).toLocaleString('ko-KR')
}

function parseNum(s) {
  if (!s) return 0
  return parseInt(String(s).replace(/[^0-9-]/g, '')) || 0
}

export default function PortfolioPage() {
  const [account, setAccount] = useState(null)   // 계좌 요약
  const [stocks, setStocks]   = useState([])      // 보유종목 리스트
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const fetchAccount = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/kiwoom?type=account')
      const data = await res.json()

      if (data.error) throw new Error(data.error)
      if (data.return_code !== 0) throw new Error(data.return_msg || '계좌 조회 실패')

      // 계좌 요약
      setAccount({
        totalPur:  parseNum(data.tot_pur_amt),
        totalEvlt: parseNum(data.tot_evlt_amt),
        totalPl:   parseNum(data.tot_evlt_pl),
        plRate:    parseFloat(data.tot_prft_rt || 0),
      })

      // 보유종목
      const list = (data.acnt_evlt_remn_indv_tot || []).map(s => ({
        code:      s.stk_cd?.replace(/^A/, ''),
        name:      s.stk_nm,
        qty:       parseNum(s.rmnd_qty),
        avgPrice:  parseNum(s.pur_pric),
        curPrice:  parseNum(s.cur_prc),
        purAmt:    parseNum(s.pur_amt),
        evltAmt:   parseNum(s.evlt_amt),
        pl:        parseNum(s.evltv_prft),
        plRate:    parseFloat(s.prft_rt || 0),
        sellable:  parseNum(s.trde_able_qty),
      }))
      setStocks(list)
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'))
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccount()
    const id = setInterval(fetchAccount, 60000) // 1분마다 갱신
    return () => clearInterval(id)
  }, [fetchAccount])

  const totalPur  = account?.totalPur  || 0
  const totalEvlt = account?.totalEvlt || 0
  const totalPl   = account?.totalPl   || 0
  const plRate    = account?.plRate    || 0
  const isUp      = totalPl > 0
  const isDown    = totalPl < 0
  const plColor   = isUp ? '#ef4444' : isDown ? '#3b82f6' : 'var(--text-2)'

  return (
    <div className="page-wrap">
      <div className="page-header">
        <div>
          <h1 className="page-title">포트폴리오</h1>
          <p className="page-sub">보유종목 · 평가손익 · 비중 관리 {lastUpdated && `· ${lastUpdated} 기준`}</p>
        </div>
        <button className="btn-ai" onClick={fetchAccount} disabled={loading}>
          {loading ? '⟳ 조회중' : '⟳ 새로고침'}
        </button>
      </div>

      <div className="page-body">

        {error && (
          <div className="card-section" style={{ color: '#ef4444', padding: '16px' }}>
            ⚠️ {error}
          </div>
        )}

        {/* 계좌 요약 */}
        {account && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:'12px', marginBottom:'16px' }}>
            <div className="card-section pf-summary-card">
              <div className="pf-summary-label">총 매입금액</div>
              <div className="pf-summary-value">{fmt(totalPur)}원</div>
            </div>
            <div className="card-section pf-summary-card">
              <div className="pf-summary-label">총 평가금액</div>
              <div className="pf-summary-value">{fmt(totalEvlt)}원</div>
            </div>
            <div className="card-section pf-summary-card">
              <div className="pf-summary-label">평가손익</div>
              <div className="pf-summary-value" style={{ color: plColor }}>
                {totalPl > 0 ? '+' : ''}{fmt(totalPl)}원
              </div>
              <div style={{ fontSize:'13px', color: plColor }}>
                {plRate > 0 ? '+' : ''}{Number(plRate).toFixed(2)}%
              </div>
            </div>
            <div className="card-section pf-summary-card">
              <div className="pf-summary-label">보유 종목 수</div>
              <div className="pf-summary-value">{stocks.length}종목</div>
            </div>
          </div>
        )}

        {/* 로딩 */}
        {loading && !account && (
          <div className="card-section pf-empty">
            <div className="empty-icon">⟳</div>
            <p>계좌 정보 조회 중...</p>
          </div>
        )}

        {/* 종목 리스트 */}
        {stocks.length === 0 && !loading && !error && (
          <div className="card-section pf-empty">
            <div className="empty-icon">💼</div>
            <p>보유 종목이 없습니다</p>
          </div>
        )}

        {stocks.length > 0 && (
          <div className="card-grid">
            {stocks.map(s => {
              const weight = totalEvlt > 0 ? (s.evltAmt / totalEvlt * 100).toFixed(1) : 0
              const isUp   = s.pl > 0
              const isDown = s.pl < 0
              const color  = isUp ? '#ef4444' : isDown ? '#3b82f6' : 'var(--text-2)'
              const sign   = isUp ? '+' : ''

              return (
                <div key={s.code} className="pf-card" style={{ '--sc': '#64748b' }}>
                  <div className="pf-card-top">
                    <span className="pf-theme-badge" style={{ background: '#64748b18', color: '#64748b' }}>
                      {s.code}
                    </span>
                    <span style={{ fontSize:'12px', color: 'var(--text-3)' }}>매도가능 {fmt(s.sellable)}주</span>
                  </div>
                  <div className="pf-name">{s.name}</div>

                  {/* 현재가 + 손익 */}
                  <div style={{ margin:'10px 0 6px' }}>
                    <div style={{ fontSize:'20px', fontWeight:700, color: 'var(--text-1)' }}>
                      {fmt(s.curPrice)}원
                    </div>
                    <div style={{ fontSize:'13px', color, marginTop:'2px' }}>
                      {sign}{fmt(s.pl)}원 ({sign}{Number(s.plRate).toFixed(2)}%)
                    </div>
                  </div>

                  <div className="pf-divider" />
                  <div className="pf-row"><span>보유수량</span><span className="pf-val">{fmt(s.qty)}주</span></div>
                  <div className="pf-row"><span>평균단가</span><span className="pf-val">{fmt(s.avgPrice)}원</span></div>
                  <div className="pf-row"><span>매입금액</span><span className="pf-val">{fmt(s.purAmt)}원</span></div>
                  <div className="pf-row"><span>평가금액</span><span className="pf-val">{fmt(s.evltAmt)}원</span></div>
                  <div className="pf-row">
                    <span>비중</span>
                    <span className="pf-val pf-weight">{weight}%</span>
                  </div>
                  <div className="pf-weight-bar">
                    <div className="pf-weight-fill" style={{ width: weight+'%', background: '#2563eb' }} />
                  </div>

                  <div className="pf-actions" style={{ marginTop:'10px' }}>
                    <button className="pf-action" onClick={() => window.open(`https://finance.naver.com/item/main.naver?code=${s.code}`,'_blank')}>정보 →</button>
                    <button className="pf-action" onClick={() => window.open(`https://finance.naver.com/item/fchart.naver?code=${s.code}`,'_blank')}>차트 →</button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
