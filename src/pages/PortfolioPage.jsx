import { useState, useEffect, useCallback } from 'react'
import StockChartModal from '../components/StockChartModal'
import './PortfolioPage.css'

function fmt(n) { if (!n && n !== 0) return '-'; return Number(n).toLocaleString('ko-KR') }
function parseNum(s) { if (!s) return 0; return parseInt(String(s).replace(/[^0-9-]/g, '')) || 0 }

export default function PortfolioPage() {
  const [account, setAccount]   = useState(null)
  const [stocks, setStocks]     = useState([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [chartStock, setChartStock]  = useState(null)

  const fetchAccount = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res  = await fetch('/api/kiwoom?type=account')
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      if (data.return_code !== 0) throw new Error(data.return_msg || '계좌 조회 실패')

      setAccount({
        totalPur:  parseNum(data.tot_pur_amt),
        totalEvlt: parseNum(data.tot_evlt_amt),
        totalPl:   parseNum(data.tot_evlt_pl),
        plRate:    parseFloat(data.tot_prft_rt || 0),
      })
      setStocks((data.acnt_evlt_remn_indv_tot || []).map(s => ({
        code:     s.stk_cd?.replace(/^A/, ''),
        name:     s.stk_nm,
        qty:      parseNum(s.rmnd_qty),
        avgPrice: parseNum(s.pur_pric),
        curPrice: parseNum(s.cur_prc),
        purAmt:   parseNum(s.pur_amt),
        evltAmt:  parseNum(s.evlt_amt),
        pl:       parseNum(s.evltv_prft),
        plRate:   parseFloat(s.prft_rt || 0),
        sellable: parseNum(s.trde_able_qty),
      })))
      setLastUpdated(new Date().toLocaleTimeString('ko-KR'))
    } catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => {
    fetchAccount()
    const id = setInterval(fetchAccount, 60000)
    return () => clearInterval(id)
  }, [fetchAccount])

  const totalPur  = account?.totalPur  || 0
  const totalEvlt = account?.totalEvlt || 0
  const totalPl   = account?.totalPl   || 0
  const plRate    = account?.plRate    || 0
  const plColor   = totalPl > 0 ? '#ef4444' : totalPl < 0 ? '#3b82f6' : 'var(--text-2)'
  const sign      = totalPl > 0 ? '+' : ''

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
        {error && <div className="card-section" style={{ color: '#ef4444', padding: '16px' }}>⚠️ {error}</div>}

        {account && (
          <div className="pf-summary-grid">
            <div className="pf-summary-card">
              <div className="pf-summary-label">총 매입금액</div>
              <div className="pf-summary-value">{fmt(totalPur)}원</div>
            </div>
            <div className="pf-summary-card">
              <div className="pf-summary-label">총 평가금액</div>
              <div className="pf-summary-value">{fmt(totalEvlt)}원</div>
            </div>
            <div className="pf-summary-card">
              <div className="pf-summary-label">평가손익</div>
              <div className="pf-summary-value" style={{ color: plColor }}>{sign}{fmt(totalPl)}원</div>
              <div className="pf-summary-rate" style={{ color: plColor }}>{sign}{Number(plRate).toFixed(2)}%</div>
            </div>
            <div className="pf-summary-card">
              <div className="pf-summary-label">보유 종목 수</div>
              <div className="pf-summary-value">{stocks.length}종목</div>
            </div>
          </div>
        )}

        {loading && !account && (
          <div className="card-section pf-empty"><div className="empty-icon">⟳</div><p>계좌 정보 조회 중...</p></div>
        )}

        {stocks.length > 0 && (
          <div className="pf-table-wrap">
            <div className="pf-table">
              <div className="pt-header">
                <div className="pt-col-name">종목명</div>
                <div className="pt-col-price">현재가</div>
                <div className="pt-col-avg">평균단가</div>
                <div className="pt-col-qty">수량</div>
                <div className="pt-col-pur">매입금액</div>
                <div className="pt-col-evlt">평가금액</div>
                <div className="pt-col-pl">손익</div>
                <div className="pt-col-rate">수익률</div>
                <div className="pt-col-weight">비중</div>
                <div className="pt-col-actions">공시</div>
              </div>

              {stocks.map(s => {
                const isUp   = s.pl > 0
                const isDown = s.pl < 0
                const pc     = isUp ? '#ef4444' : isDown ? '#3b82f6' : 'var(--text-1)'
                const sign   = isUp ? '+' : ''
                const weight = totalEvlt > 0 ? (s.evltAmt / totalEvlt * 100).toFixed(1) : 0

                return (
                  <div key={s.code} className="pt-row pt-row-clickable"
                    onClick={() => setChartStock({ name: s.name, code: s.code })}>
                    <div className="pt-col-name">
                      <div className="pt-name">{s.name}</div>
                      <div className="pt-code">{s.code}</div>
                    </div>
                    <div className="pt-col-price" style={{ color: pc, fontWeight: 700 }}>{fmt(s.curPrice)}원</div>
                    <div className="pt-col-avg">{fmt(s.avgPrice)}원</div>
                    <div className="pt-col-qty">{fmt(s.qty)}주</div>
                    <div className="pt-col-pur">{fmt(s.purAmt)}원</div>
                    <div className="pt-col-evlt">{fmt(s.evltAmt)}원</div>
                    <div className="pt-col-pl" style={{ color: pc }}>{sign}{fmt(s.pl)}원</div>
                    <div className="pt-col-rate" style={{ color: pc, fontWeight: 600 }}>{sign}{Number(s.plRate).toFixed(2)}%</div>
                    <div className="pt-col-weight">
                      <div className="pt-weight-text">{weight}%</div>
                      <div className="pt-weight-bar"><div className="pt-weight-fill" style={{ width: weight + '%' }} /></div>
                    </div>
                    <div className="pt-col-actions" onClick={e => e.stopPropagation()}>
                      <a className="pt-btn"
                        href={`https://dart.fss.or.kr/dsab007/detailSearch.ax?textCrpNm=${encodeURIComponent(s.name)}`}
                        target="_blank" rel="noreferrer">공시</a>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {stocks.length === 0 && !loading && !error && (
          <div className="card-section pf-empty"><div className="empty-icon">💼</div><p>보유 종목이 없습니다</p></div>
        )}
      </div>

      {chartStock && (
        <StockChartModal stock={chartStock} onClose={() => setChartStock(null)} />
      )}
    </div>
  )
}
