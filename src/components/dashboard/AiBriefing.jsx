// src/components/dashboard/AiBriefing.jsx
import { useState } from 'react'

const LS_BRIEFING = 'db_briefing_v1'

export default function AiBriefing() {
  const [briefing,setBriefing]=useState(()=>{try{const r=localStorage.getItem(LS_BRIEFING);if(!r)return null;const{data,date}=JSON.parse(r);return date===new Date().toISOString().slice(0,10)?data:null}catch{return null}})
  const [loading,setLoading]=useState(false),[error,setError]=useState(''),[open,setOpen]=useState(!!briefing)
  const run=async()=>{const key=import.meta.env.VITE_CLAUDE_API_KEY;if(!key){setError('Claude API 키 미설정');return}
    setLoading(true);setError('')
    try{const today=new Date().toLocaleDateString('ko-KR')
      const res=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:800,tools:[{type:'web_search_20250305',name:'web_search'}],messages:[{role:'user',content:`오늘(${today}) 한국 주식시장 AI 브리핑. 웹 검색으로 최신 뉴스 찾아 작성.\n## 📊 오늘의 시장 요약 ## 🔑 핵심 이슈 ## 🌏 글로벌 변수 ## 🎯 주목 섹터 ## ⚠️ 리스크 요인`}]})})
      const data=await res.json(); const text=data.content?.filter(b=>b.type==='text').map(b=>b.text).join('\n')||''
      if(!text) throw new Error('응답 없음')
      setBriefing(text);setOpen(true);localStorage.setItem(LS_BRIEFING,JSON.stringify({data:text,date:new Date().toISOString().slice(0,10)}))
    }catch(e){setError(e.message)}finally{setLoading(false)}
  }
  return (
    <section className="dash-section">
      <div className="db-section-header">
        <span className="db-section-label">🤖 AI 시장 브리핑 <span className="db-briefing-badge">web_search</span></span>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {briefing&&<button className="db-briefing-toggle" onClick={()=>setOpen(v=>!v)}>{open?'▲ 접기':'▼ 펼치기'}</button>}
          <button className="btn-outline" onClick={run} disabled={loading}>{loading?'⟳ 검색 중...':briefing?'↺ 다시 분석':'🔍 오늘 브리핑 생성'}</button>
        </div>
      </div>
      {error&&<div className="db-briefing-error">⚠️ {error}</div>}
      {loading&&<div className="db-briefing-loading"><div className="db-briefing-spinner"/><span>웹에서 오늘 시장 정보 검색 중...</span></div>}
      {briefing&&open&&!loading&&<div><pre className="db-briefing-text">{briefing}</pre><div className="db-briefing-meta">오늘({new Date().toLocaleDateString('ko-KR')}) 자동 저장</div></div>}
      {!briefing&&!loading&&!error&&<div className="db-briefing-placeholder">🔍 버튼을 눌러 오늘 시장 브리핑을 생성하세요</div>}
    </section>
  )
}
