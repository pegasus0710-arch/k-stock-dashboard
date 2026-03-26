import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, orderBy, query, serverTimestamp,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import './MemoPage.css'

// ── 상수 ─────────────────────────────────────────────
const COLORS = [
  '#f1f5f9','#fef3c7','#fce7f3','#ede9fe','#dcfce7','#dbeafe','#ffedd5','#f0fdf4',
  '#1e293b','#292524','#1c1917','#0c0a09',
]
const TEXT_COLORS = [
  '#0f172a','#1e293b','#334155','#64748b','#94a3b8',
  '#ef4444','#f97316','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899',
  '#ffffff','#fef3c7','#bbf7d0','#bfdbfe',
]
const FONT_SIZES = ['12','13','14','15','16','18','20','22','24','28','32']
const TAGS = ['전략','아이디어','종목','매수','매도','리스크','공부','기타']
const TAG_COLORS = {
  '전략':'#3b82f6','아이디어':'#8b5cf6','종목':'#f59e0b',
  '매수':'#10b981','매도':'#ef4444','리스크':'#f97316',
  '공부':'#06b6d4','기타':'#94a3b8',
}

function lsGet(k,d){ try{return JSON.parse(localStorage.getItem(k))??d}catch{return d} }
function lsSet(k,v){ try{localStorage.setItem(k,JSON.stringify(v))}catch{} }

// ── 색상 팔레트 피커 ─────────────────────────────────
function ColorPicker({ value, onChange, colors, label, size=20 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(()=>{
    const fn = e => { if(ref.current&&!ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown',fn); return ()=>document.removeEventListener('mousedown',fn)
  },[])
  return (
    <div className="mp-color-picker" ref={ref}>
      <button className="mp-color-swatch" style={{background:value,width:size,height:size}} onClick={()=>setOpen(v=>!v)} title={label}/>
      {open&&(
        <div className="mp-color-palette">
          <div className="mp-palette-label">{label}</div>
          <div className="mp-palette-grid">
            {colors.map(c=>(
              <button key={c} className={`mp-palette-dot ${value===c?'selected':''}`}
                style={{background:c}} onClick={()=>{ onChange(c); setOpen(false) }}/>
            ))}
          </div>
          <div className="mp-palette-custom">
            <label>직접 입력:</label>
            <input type="color" value={value} onChange={e=>{ onChange(e.target.value); setOpen(false) }}/>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 메모 카드 ─────────────────────────────────────────
function MemoCard({ memo, onEdit, onDelete, onPin }) {
  const [confirm, setConfirm] = useState(false)
  const lines = (memo.content||'').split('\n').filter(Boolean)
  const preview = lines.slice(0,4).join('\n')
  const hasMore = lines.length > 4

  return (
    <div className="mp-card" style={{background:memo.bgColor||'#1e293b',borderColor:memo.pinned?'#f59e0b':'#334155'}}
      onClick={()=>onEdit(memo)}>
      {memo.pinned&&<div className="mp-pin-badge">📌</div>}
      {memo.tags?.length>0&&(
        <div className="mp-card-tags" onClick={e=>e.stopPropagation()}>
          {memo.tags.map(t=>(
            <span key={t} className="mp-tag-chip" style={{background:TAG_COLORS[t]+'33',color:TAG_COLORS[t],border:`1px solid ${TAG_COLORS[t]}55`}}>{t}</span>
          ))}
        </div>
      )}
      <div className="mp-card-title" style={{color:memo.titleColor||'#f1f5f9'}}>{memo.title||'제목 없음'}</div>
      <pre className="mp-card-preview" style={{color:memo.textColor||'#94a3b8',fontSize:(memo.fontSize||14)+'px'}}>{preview}</pre>
      {hasMore&&<div className="mp-card-more" style={{color:memo.textColor||'#94a3b8',opacity:0.5}}>...더 보기</div>}
      <div className="mp-card-footer">
        <span className="mp-card-date">{memo.updatedAt?.toDate?.()?.toLocaleDateString('ko-KR')||''}</span>
        <div className="mp-card-actions" onClick={e=>e.stopPropagation()}>
          <button className="mp-action-btn" onClick={()=>onPin(memo)} title={memo.pinned?'고정 해제':'고정'}>
            {memo.pinned?'📌':'📍'}
          </button>
          {confirm
            ? <>
                <button className="mp-action-btn danger" onClick={()=>onDelete(memo.id)}>확인</button>
                <button className="mp-action-btn" onClick={()=>setConfirm(false)}>취소</button>
              </>
            : <button className="mp-action-btn danger" onClick={()=>setConfirm(true)}>🗑</button>
          }
        </div>
      </div>
    </div>
  )
}

// ── 메모 에디터 ───────────────────────────────────────
function MemoEditor({ memo, onSave, onClose }) {
  const [title,      setTitle]      = useState(memo?.title||'')
  const [content,    setContent]    = useState(memo?.content||'')
  const [bgColor,    setBgColor]    = useState(memo?.bgColor||'#1e293b')
  const [titleColor, setTitleColor] = useState(memo?.titleColor||'#f1f5f9')
  const [textColor,  setTextColor]  = useState(memo?.textColor||'#cbd5e1')
  const [fontSize,   setFontSize]   = useState(memo?.fontSize||14)
  const [tags,       setTags]       = useState(memo?.tags||[])
  const [saving,     setSaving]     = useState(false)
  const textRef = useRef(null)

  // 텍스트 편집 명령
  function execCmd(cmd, value=null) {
    textRef.current?.focus()
    document.execCommand(cmd, false, value)
  }

  function toggleTag(t) {
    setTags(prev => prev.includes(t) ? prev.filter(x=>x!==t) : [...prev,t])
  }

  async function handleSave() {
    setSaving(true)
    await onSave({ title, content, bgColor, titleColor, textColor, fontSize, tags })
    setSaving(false)
  }

  // 키보드 단축키
  function handleKeyDown(e) {
    if ((e.ctrlKey||e.metaKey) && e.key==='s') { e.preventDefault(); handleSave() }
    if (e.key==='Escape') onClose()
    // Tab → 들여쓰기
    if (e.key==='Tab') {
      e.preventDefault()
      const s=e.target.selectionStart, en=e.target.selectionEnd
      const v=e.target.value
      e.target.value=v.slice(0,s)+'  '+v.slice(en)
      e.target.selectionStart=e.target.selectionEnd=s+2
      setContent(e.target.value)
    }
  }

  return (
    <div className="mp-editor-overlay" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
      <div className="mp-editor" style={{background:bgColor}}>

        {/* 에디터 헤더 툴바 */}
        <div className="mp-editor-toolbar">
          <div className="mp-toolbar-row">
            {/* 배경색 */}
            <ColorPicker value={bgColor} onChange={setBgColor} colors={COLORS} label="배경색" size={22}/>
            {/* 텍스트 색 */}
            <ColorPicker value={textColor} onChange={setTextColor} colors={TEXT_COLORS} label="글자색" size={22}/>
            {/* 제목 색 */}
            <div style={{display:'flex',alignItems:'center',gap:4}}>
              <span className="mp-toolbar-label">제목</span>
              <ColorPicker value={titleColor} onChange={setTitleColor} colors={TEXT_COLORS} label="제목색" size={22}/>
            </div>
            {/* 글자 크기 */}
            <div className="mp-toolbar-group">
              <span className="mp-toolbar-label">크기</span>
              <select className="mp-select" value={fontSize} onChange={e=>setFontSize(Number(e.target.value))}>
                {FONT_SIZES.map(s=><option key={s} value={s}>{s}px</option>)}
              </select>
            </div>
            {/* 텍스트 서식 */}
            <div className="mp-toolbar-group">
              <button className="mp-fmt-btn" onClick={()=>execCmd('bold')} title="굵게 (Ctrl+B)"><b>B</b></button>
              <button className="mp-fmt-btn" onClick={()=>execCmd('italic')} title="기울임 (Ctrl+I)"><i>I</i></button>
              <button className="mp-fmt-btn" onClick={()=>execCmd('underline')} title="밑줄 (Ctrl+U)"><u>U</u></button>
            </div>
            <div style={{flex:1}}/>
            <button className="mp-save-btn" onClick={handleSave} disabled={saving}>
              {saving?'저장 중...':'💾 저장 (Ctrl+S)'}
            </button>
            <button className="mp-close-btn" onClick={onClose}>✕</button>
          </div>

          {/* 태그 */}
          <div className="mp-tags-row">
            <span className="mp-toolbar-label">태그:</span>
            {TAGS.map(t=>(
              <button key={t} className={`mp-tag-btn ${tags.includes(t)?'active':''}`}
                style={tags.includes(t)?{background:TAG_COLORS[t]+'33',color:TAG_COLORS[t],borderColor:TAG_COLORS[t]+'66'}:{}}
                onClick={()=>toggleTag(t)}>{t}</button>
            ))}
          </div>
        </div>

        {/* 제목 입력 */}
        <input
          className="mp-title-input"
          style={{color:titleColor, fontSize:Math.min(fontSize+6,28)+'px'}}
          placeholder="제목을 입력하세요..."
          value={title}
          onChange={e=>setTitle(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); textRef.current?.focus() } }}
        />

        {/* 본문 입력 */}
        <textarea
          ref={textRef}
          className="mp-content-input"
          style={{color:textColor, fontSize:fontSize+'px', background:'transparent'}}
          placeholder={`내용을 입력하세요...\n\n• 투자 아이디어\n• 종목 분석 메모\n• 매매 전략\n• 공부 내용`}
          value={content}
          onChange={e=>setContent(e.target.value)}
          onKeyDown={handleKeyDown}
        />

        {/* 하단 정보 */}
        <div className="mp-editor-footer">
          <span style={{color:textColor,opacity:0.4,fontSize:11}}>
            {content.length}자 · {content.split('\n').filter(Boolean).length}줄
          </span>
          <span style={{color:textColor,opacity:0.4,fontSize:11}}>ESC: 닫기 · Ctrl+S: 저장</span>
        </div>
      </div>
    </div>
  )
}

// ══════════════════════════════════════════════════════
// MemoPage 메인
// ══════════════════════════════════════════════════════
export default function MemoPage() {
  const { user } = useAuth()
  const [memos,      setMemos]      = useState([])
  const [loading,    setLoading]    = useState(true)
  const [editMemo,   setEditMemo]   = useState(null)   // null | {} | memo객체
  const [searchQ,    setSearchQ]    = useState('')
  const [filterTag,  setFilterTag]  = useState('')
  const [sortBy,     setSortBy]     = useState('updated') // updated | created | title
  const [viewMode,   setViewMode]   = useState(()=>lsGet('mp_view','grid')) // grid | list

  // Firestore 실시간 구독
  useEffect(()=>{
    if (!user) return
    const col = collection(db, 'users', user.uid, 'memos')
    const q   = query(col, orderBy('updatedAt','desc'))
    const unsub = onSnapshot(q, snap=>{
      setMemos(snap.docs.map(d=>({ id:d.id, ...d.data() })))
      setLoading(false)
    }, err=>{
      console.error('memo snapshot error:', err)
      setLoading(false)
    })
    return ()=>unsub()
  },[user])

  // 새 메모 저장 / 기존 메모 수정
  const handleSave = useCallback(async(data) => {
    if (!user) return
    const col = collection(db, 'users', user.uid, 'memos')
    const payload = { ...data, updatedAt: serverTimestamp() }

    if (editMemo?.id) {
      // 수정
      await updateDoc(doc(db,'users',user.uid,'memos',editMemo.id), payload)
    } else {
      // 신규
      await addDoc(col, { ...payload, createdAt: serverTimestamp(), pinned: false })
    }
    setEditMemo(null)
  },[user, editMemo])

  // 삭제
  const handleDelete = useCallback(async(id) => {
    if (!user) return
    await deleteDoc(doc(db,'users',user.uid,'memos',id))
  },[user])

  // 고정/해제
  const handlePin = useCallback(async(memo) => {
    if (!user) return
    await updateDoc(doc(db,'users',user.uid,'memos',memo.id), {
      pinned: !memo.pinned, updatedAt: serverTimestamp()
    })
  },[user])

  // 필터 + 정렬
  const filtered = memos
    .filter(m => {
      if (filterTag && !m.tags?.includes(filterTag)) return false
      if (searchQ) {
        const q = searchQ.toLowerCase()
        return (m.title||'').toLowerCase().includes(q) || (m.content||'').toLowerCase().includes(q)
      }
      return true
    })
    .sort((a,b) => {
      if (a.pinned!==b.pinned) return b.pinned-a.pinned // 고정 우선
      if (sortBy==='title') return (a.title||'').localeCompare(b.title||'')
      if (sortBy==='created') return (b.createdAt?.toMillis?.()??0)-(a.createdAt?.toMillis?.()??0)
      return (b.updatedAt?.toMillis?.()??0)-(a.updatedAt?.toMillis?.()??0)
    })

  const pinnedCount = memos.filter(m=>m.pinned).length

  return (
    <div className="mp-wrap">
      {/* 페이지 헤더 */}
      <div className="page-header">
        <div>
          <h1 className="page-title">메모장</h1>
          <p className="page-sub">투자 아이디어 · 종목 분석 · 매매 전략 · 공부 기록</p>
        </div>
        <button className="mp-new-btn" onClick={()=>setEditMemo({})}>
          ✏️ 새 메모
        </button>
      </div>

      {/* 툴바 */}
      <div className="mp-toolbar">
        {/* 검색 */}
        <div className="mp-search-wrap">
          <span className="mp-search-icon">🔍</span>
          <input className="mp-search-input" placeholder="메모 검색..." value={searchQ} onChange={e=>setSearchQ(e.target.value)}/>
          {searchQ&&<button className="mp-search-clear" onClick={()=>setSearchQ('')}>✕</button>}
        </div>

        {/* 태그 필터 */}
        <div className="mp-tag-filter">
          <button className={`mp-filter-btn ${!filterTag?'active':''}`} onClick={()=>setFilterTag('')}>전체 <span className="mp-count">{memos.length}</span></button>
          {TAGS.map(t=>{
            const cnt=memos.filter(m=>m.tags?.includes(t)).length
            if (!cnt) return null
            return (
              <button key={t} className={`mp-filter-btn ${filterTag===t?'active':''}`}
                style={filterTag===t?{background:TAG_COLORS[t]+'33',color:TAG_COLORS[t],borderColor:TAG_COLORS[t]+'66'}:{}}
                onClick={()=>setFilterTag(p=>p===t?'':t)}>
                {t} <span className="mp-count">{cnt}</span>
              </button>
            )
          })}
        </div>

        <div style={{flex:1}}/>

        {/* 정렬 */}
        <select className="mp-select" value={sortBy} onChange={e=>setSortBy(e.target.value)}>
          <option value="updated">수정일순</option>
          <option value="created">작성일순</option>
          <option value="title">제목순</option>
        </select>

        {/* 뷰 모드 */}
        <div className="mp-view-btns">
          <button className={`mp-view-btn ${viewMode==='grid'?'active':''}`} onClick={()=>{ setViewMode('grid'); lsSet('mp_view','grid') }}>⊞</button>
          <button className={`mp-view-btn ${viewMode==='list'?'active':''}`} onClick={()=>{ setViewMode('list'); lsSet('mp_view','list') }}>☰</button>
        </div>
      </div>

      {/* 통계 바 */}
      {memos.length>0&&(
        <div className="mp-stats">
          <span>📝 총 {memos.length}개</span>
          {pinnedCount>0&&<span>📌 고정 {pinnedCount}개</span>}
          {searchQ&&<span>🔍 "{searchQ}" 검색 결과 {filtered.length}개</span>}
          {filterTag&&<span>🏷 {filterTag} {filtered.length}개</span>}
        </div>
      )}

      {/* 메모 목록 */}
      {loading ? (
        <div className="mp-loading">
          <div className="mp-spinner"/>메모를 불러오는 중...
        </div>
      ) : filtered.length===0 ? (
        <div className="mp-empty">
          {memos.length===0 ? (
            <>
              <div className="mp-empty-icon">📝</div>
              <p>첫 번째 메모를 작성해보세요</p>
              <p className="mp-empty-sub">투자 아이디어, 종목 분석, 매매 전략을 기록하세요</p>
              <button className="mp-new-btn" onClick={()=>setEditMemo({})}>✏️ 새 메모 작성</button>
            </>
          ) : (
            <>
              <div className="mp-empty-icon">🔍</div>
              <p>검색 결과가 없습니다</p>
              <button className="mp-new-btn outline" onClick={()=>{ setSearchQ(''); setFilterTag('') }}>필터 초기화</button>
            </>
          )}
        </div>
      ) : (
        <div className={`mp-memo-grid ${viewMode}`}>
          {filtered.map(memo=>(
            <MemoCard key={memo.id} memo={memo} onEdit={setEditMemo} onDelete={handleDelete} onPin={handlePin}/>
          ))}
        </div>
      )}

      {/* 에디터 */}
      {editMemo!==null&&(
        <MemoEditor
          memo={editMemo.id?editMemo:null}
          onSave={handleSave}
          onClose={()=>setEditMemo(null)}
        />
      )}

      {/* 빠른 작성 FAB */}
      <button className="mp-fab" onClick={()=>setEditMemo({})} title="새 메모">✏️</button>
    </div>
  )
}
