import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, orderBy, query, Timestamp,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import './MemoPage.css'

// ── 색상 프리셋 ───────────────────────────────────────
const BG_COLORS = [
  '#1e293b','#0f172a','#1c1917','#172033',
  '#fef3c7','#fce7f3','#ede9fe','#dcfce7',
  '#dbeafe','#ffedd5','#f0fdf4','#f1f5f9',
]
const TEXT_COLORS = [
  '#f1f5f9','#e2e8f0','#cbd5e1','#94a3b8',
  '#fef3c7','#bbf7d0','#bfdbfe','#fecaca',
  '#0f172a','#1e293b','#334155','#ffffff',
  '#ef4444','#f97316','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899',
]
const FONT_SIZES = ['12','13','14','15','16','18','20','22','24','28']

// ── 기본 카테고리 ─────────────────────────────────────
const DEFAULT_CATEGORIES = [
  { name:'전략',    color:'#3b82f6' },
  { name:'아이디어', color:'#8b5cf6' },
  { name:'종목',    color:'#f59e0b' },
  { name:'매수',    color:'#10b981' },
  { name:'매도',    color:'#ef4444' },
  { name:'리스크',  color:'#f97316' },
  { name:'공부',    color:'#06b6d4' },
  { name:'기타',    color:'#94a3b8' },
]

const LS_CATS = 'mp_categories_v1'
const LS_VIEW = 'mp_view_v1'
const LS_SORT = 'mp_sort_v1'

function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// ── 색상 피커 ─────────────────────────────────────────
function ColorPicker({ value, onChange, colors, label, size = 22 }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', fn)
    return () => document.removeEventListener('mousedown', fn)
  }, [])
  return (
    <div className="mp-cpicker" ref={ref}>
      <div className="mp-cpicker-trigger" onClick={() => setOpen(v => !v)}>
        <span className="mp-cpicker-label">{label}</span>
        <div className="mp-cpicker-swatch" style={{ background: value, width: size, height: size }}/>
      </div>
      {open && (
        <div className="mp-cpicker-panel">
          <div className="mp-cpicker-grid">
            {colors.map(c => (
              <button key={c}
                className={`mp-cpicker-dot ${value === c ? 'selected' : ''}`}
                style={{ background: c }}
                onClick={() => { onChange(c); setOpen(false) }}/>
            ))}
          </div>
          <div className="mp-cpicker-custom">
            <span>직접 선택</span>
            <input type="color" value={value}
              onChange={e => onChange(e.target.value)}
              onBlur={() => setTimeout(() => setOpen(false), 200)}/>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 카테고리 관리 모달 ────────────────────────────────
function CategoryManager({ categories, onChange, onClose }) {
  const [newName,  setNewName]  = useState('')
  const [newColor, setNewColor] = useState('#3b82f6')
  const [error,    setError]    = useState('')

  const addCat = () => {
    const name = newName.trim()
    if (!name) { setError('이름을 입력하세요'); return }
    if (categories.find(c => c.name === name)) { setError('이미 존재합니다'); return }
    onChange([...categories, { name, color: newColor }])
    setNewName(''); setError('')
  }

  return (
    <div className="mp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mp-catmgr">
        <div className="mp-catmgr-header">
          <span>🏷 카테고리 관리</span>
          <button className="mp-icon-btn" onClick={onClose}>✕</button>
        </div>

        <div className="mp-catmgr-add">
          <input className="mp-catmgr-input" placeholder="새 카테고리 이름"
            value={newName} onChange={e => { setNewName(e.target.value); setError('') }}
            onKeyDown={e => e.key === 'Enter' && addCat()}/>
          <div className="mp-catmgr-colorpick">
            <span className="mp-cpicker-label">색상</span>
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
              className="mp-catmgr-colorinput"/>
          </div>
          <button className="mp-catmgr-addbtn" onClick={addCat}>+ 추가</button>
        </div>
        {error && <div className="mp-catmgr-error">{error}</div>}

        <div className="mp-catmgr-list">
          {categories.map(cat => {
            const isDefault = DEFAULT_CATEGORIES.some(d => d.name === cat.name)
            return (
              <div key={cat.name} className="mp-catmgr-item">
                <span className="mp-catmgr-dot" style={{ background: cat.color }}/>
                <span className="mp-catmgr-name">{cat.name}</span>
                {isDefault
                  ? <span className="mp-catmgr-default">기본</span>
                  : <button className="mp-catmgr-del"
                      onClick={() => onChange(categories.filter(c => c.name !== cat.name))}>
                      🗑
                    </button>
                }
              </div>
            )
          })}
        </div>

        <div className="mp-catmgr-footer">
          <span className="mp-catmgr-hint">기본 카테고리는 삭제할 수 없습니다</span>
          <button className="mp-save-btn" onClick={onClose}>완료</button>
        </div>
      </div>
    </div>
  )
}

// ── 메모 에디터 ───────────────────────────────────────
function MemoEditor({ memo, categories, onSave, onClose }) {
  const [title,      setTitle]      = useState(memo?.title || '')
  const [content,    setContent]    = useState(memo?.content || '')
  const [bgColor,    setBgColor]    = useState(memo?.bgColor || '#1e293b')
  const [titleColor, setTitleColor] = useState(memo?.titleColor || '#f1f5f9')
  const [textColor,  setTextColor]  = useState(memo?.textColor || '#cbd5e1')
  const [fontSize,   setFontSize]   = useState(memo?.fontSize || 14)
  const [tags,       setTags]       = useState(memo?.tags || [])
  const [tagInput,   setTagInput]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState('')
  const [saveOk,     setSaveOk]     = useState(false)
  const textRef = useRef(null)

  // 카테고리 토글
  const toggleCat = name => {
    setTags(prev => prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name])
  }

  // 직접 입력 태그 추가
  const addTagInput = () => {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) { setTagInput(''); return }
    setTags(prev => [...prev, t])
    setTagInput('')
  }

  // 태그 제거
  const removeTag = name => setTags(prev => prev.filter(t => t !== name))

  // 저장
  async function handleSave() {
    if (!title.trim() && !content.trim()) {
      setSaveError('제목 또는 내용을 입력해주세요')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      await onSave({ title, content, bgColor, titleColor, textColor, fontSize, tags })
      setSaveOk(true)
      setTimeout(() => { setSaveOk(false); onClose() }, 700)
    } catch (e) {
      console.error('저장 오류:', e)
      setSaveError('저장 실패: ' + (e.message || '다시 시도해주세요'))
    } finally {
      setSaving(false)
    }
  }

  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onClose()
    if (e.key === 'Tab') {
      e.preventDefault()
      const s = e.target.selectionStart, en = e.target.selectionEnd
      const v = e.target.value
      e.target.value = v.slice(0, s) + '  ' + v.slice(en)
      e.target.selectionStart = e.target.selectionEnd = s + 2
      setContent(e.target.value)
    }
  }

  return (
    <div className="mp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mp-editor" style={{ background: bgColor }}>

        {/* ── 툴바 ── */}
        <div className="mp-editor-toolbar">

          {/* 1행: 색상 · 크기 · 서식 · 버튼 */}
          <div className="mp-toolbar-row">
            <ColorPicker value={bgColor}    onChange={setBgColor}    colors={BG_COLORS}   label="배경"/>
            <ColorPicker value={textColor}  onChange={setTextColor}  colors={TEXT_COLORS} label="글자"/>
            <ColorPicker value={titleColor} onChange={setTitleColor} colors={TEXT_COLORS} label="제목"/>
            <div className="mp-toolbar-sep"/>
            <div className="mp-toolbar-group">
              <span className="mp-cpicker-label">크기</span>
              <select className="mp-select" value={fontSize}
                onChange={e => setFontSize(Number(e.target.value))}>
                {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
              </select>
            </div>
            <div className="mp-toolbar-group">
              <button className="mp-fmt-btn" onClick={() => document.execCommand('bold')}><b>B</b></button>
              <button className="mp-fmt-btn" onClick={() => document.execCommand('italic')}><i>I</i></button>
              <button className="mp-fmt-btn" onClick={() => document.execCommand('underline')}><u>U</u></button>
            </div>
            <div style={{ flex: 1 }}/>
            <button
              className={`mp-save-btn ${saveOk ? 'ok' : ''}`}
              onClick={handleSave} disabled={saving}>
              {saving ? '⟳ 저장 중...' : saveOk ? '✅ 저장됨!' : '💾 저장'}
            </button>
            <button className="mp-icon-btn" onClick={onClose} style={{ marginLeft: 4 }}>✕</button>
          </div>

          {/* 저장 에러 */}
          {saveError && <div className="mp-save-error">⚠️ {saveError}</div>}

          {/* 2행: 태그 선택됨 + 직접입력 */}
          <div className="mp-tags-section">
            <span className="mp-cpicker-label" style={{ flexShrink: 0 }}>태그</span>
            <div className="mp-selected-tags">
              {tags.map(t => {
                const cat   = categories.find(c => c.name === t)
                const color = cat?.color || '#94a3b8'
                return (
                  <span key={t} className="mp-selected-tag"
                    style={{ background: color + '33', color, border: `1px solid ${color}66` }}>
                    {t}
                    <button className="mp-tag-x" onClick={() => removeTag(t)}>×</button>
                  </span>
                )
              })}
            </div>
            <input className="mp-tag-input" placeholder="직접 입력 후 Enter"
              value={tagInput} onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTagInput() } }}/>
          </div>

          {/* 3행: 카테고리 버튼들 */}
          <div className="mp-cats-row">
            {categories.map(cat => (
              <button key={cat.name}
                className={`mp-cat-btn ${tags.includes(cat.name) ? 'active' : ''}`}
                style={tags.includes(cat.name)
                  ? { background: cat.color + '33', color: cat.color, borderColor: cat.color + '66' }
                  : {}}
                onClick={() => toggleCat(cat.name)}>
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* ── 제목 ── */}
        <input className="mp-title-input"
          style={{ color: titleColor, fontSize: Math.min(fontSize + 6, 28) + 'px' }}
          placeholder="제목을 입력하세요..."
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); textRef.current?.focus() } }}/>

        {/* ── 본문 ── */}
        <textarea ref={textRef}
          className="mp-content-input"
          style={{ color: textColor, fontSize: fontSize + 'px', background: 'transparent' }}
          placeholder={'내용을 입력하세요...\n\n• 투자 아이디어\n• 종목 분석 메모\n• 매매 전략\n• 공부 내용'}
          value={content}
          onChange={e => setContent(e.target.value)}
          onKeyDown={handleKeyDown}/>

        {/* ── 하단 ── */}
        <div className="mp-editor-footer">
          <span style={{ color: textColor, opacity: 0.35, fontSize: 11 }}>
            {content.length}자 · {content.split('\n').filter(Boolean).length}줄
          </span>
          <span style={{ color: textColor, opacity: 0.35, fontSize: 11 }}>
            Ctrl+S 저장 · ESC 닫기 · Tab 들여쓰기
          </span>
        </div>
      </div>
    </div>
  )
}

// ── 메모 카드 ─────────────────────────────────────────
function MemoCard({ memo, categories, onEdit, onDelete, onPin }) {
  const [confirm, setConfirm] = useState(false)
  const lines   = (memo.content || '').split('\n').filter(Boolean)
  const preview = lines.slice(0, 3).join('\n')
  const hasMore = lines.length > 3

  const getTagColor = name => categories.find(c => c.name === name)?.color || '#94a3b8'

  return (
    <div className="mp-card"
      style={{ background: memo.bgColor || '#1e293b', borderColor: memo.pinned ? '#f59e0b' : '#334155' }}
      onClick={() => onEdit(memo)}>

      {memo.pinned && <div className="mp-pin-badge">📌</div>}

      {memo.tags?.length > 0 && (
        <div className="mp-card-tags" onClick={e => e.stopPropagation()}>
          {memo.tags.map(t => {
            const color = getTagColor(t)
            return (
              <span key={t} className="mp-tag-chip"
                style={{ background: color + '33', color, border: `1px solid ${color}55` }}>
                {t}
              </span>
            )
          })}
        </div>
      )}

      <div className="mp-card-title" style={{ color: memo.titleColor || '#f1f5f9' }}>
        {memo.title || '제목 없음'}
      </div>

      <pre className="mp-card-preview"
        style={{ color: memo.textColor || '#94a3b8', fontSize: Math.min(memo.fontSize || 13, 14) + 'px' }}>
        {preview}
      </pre>

      {hasMore && (
        <div className="mp-card-more" style={{ color: memo.textColor || '#94a3b8', opacity: 0.5 }}>
          ...더 보기
        </div>
      )}

      <div className="mp-card-footer">
        <span className="mp-card-date">
          {memo.updatedAt?.toDate?.()?.toLocaleDateString('ko-KR') || ''}
        </span>
        <div className="mp-card-actions" onClick={e => e.stopPropagation()}>
          <button className="mp-action-btn" onClick={() => onPin(memo)}
            title={memo.pinned ? '고정 해제' : '고정'}>
            {memo.pinned ? '📌' : '📍'}
          </button>
          {confirm ? (
            <>
              <button className="mp-action-btn danger" onClick={() => onDelete(memo.id)}>삭제</button>
              <button className="mp-action-btn" onClick={() => setConfirm(false)}>취소</button>
            </>
          ) : (
            <button className="mp-action-btn danger" onClick={() => setConfirm(true)}>🗑</button>
          )}
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
  const [loadError,  setLoadError]  = useState('')
  const [editMemo,   setEditMemo]   = useState(null)
  const [searchQ,    setSearchQ]    = useState('')
  const [filterTag,  setFilterTag]  = useState('')
  const [sortBy,     setSortBy]     = useState(() => lsGet(LS_SORT, 'updated'))
  const [viewMode,   setViewMode]   = useState(() => lsGet(LS_VIEW, 'grid'))
  const [showCatMgr, setShowCatMgr] = useState(false)
  const [categories, setCategories] = useState(() => lsGet(LS_CATS, null) || DEFAULT_CATEGORIES)

  const handleCatsChange = cats => { setCategories(cats); lsSet(LS_CATS, cats) }

  // ── Firestore 구독 ────────────────────────────────
  useEffect(() => {
    if (!user) return
    const col = collection(db, 'users', user.uid, 'memos')
    const q   = query(col, orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(q,
      snap => { setMemos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      err  => { console.error(err); setLoadError('Firestore 권한 오류: ' + err.message); setLoading(false) }
    )
    return () => unsub()
  }, [user])

  // ── 저장 ──────────────────────────────────────────
  const handleSave = useCallback(async data => {
    if (!user) throw new Error('로그인 필요')
    const now = Timestamp.fromDate(new Date())
    if (editMemo?.id) {
      await updateDoc(doc(db, 'users', user.uid, 'memos', editMemo.id), { ...data, updatedAt: now })
    } else {
      await addDoc(collection(db, 'users', user.uid, 'memos'),
        { ...data, createdAt: now, updatedAt: now, pinned: false })
    }
    setEditMemo(null)
  }, [user, editMemo])

  // ── 삭제 ──────────────────────────────────────────
  const handleDelete = useCallback(async id => {
    if (!user) return
    await deleteDoc(doc(db, 'users', user.uid, 'memos', id))
  }, [user])

  // ── 고정 ──────────────────────────────────────────
  const handlePin = useCallback(async memo => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'memos', memo.id), {
      pinned: !memo.pinned, updatedAt: Timestamp.fromDate(new Date())
    })
  }, [user])

  // ── 필터 + 정렬 ───────────────────────────────────
  const filtered = memos
    .filter(m => {
      if (filterTag && !m.tags?.includes(filterTag)) return false
      if (searchQ) {
        const q = searchQ.toLowerCase()
        return (m.title || '').toLowerCase().includes(q)
          || (m.content || '').toLowerCase().includes(q)
          || m.tags?.some(t => t.toLowerCase().includes(q))
      }
      return true
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      if (sortBy === 'title')   return (a.title || '').localeCompare(b.title || '')
      if (sortBy === 'created') return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      return (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)
    })

  const usedTags    = [...new Set(memos.flatMap(m => m.tags || []))]
  const pinnedCount = memos.filter(m => m.pinned).length

  return (
    <div className="mp-wrap">

      {/* 헤더 */}
      <div className="mp-page-header">
        <div>
          <h1 className="page-title">📝 메모장</h1>
          <p className="page-sub">투자 아이디어 · 종목 분석 · 매매 전략 · 공부 기록</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="mp-cat-mgr-btn" onClick={() => setShowCatMgr(true)}>
            🏷 카테고리
          </button>
          <button className="mp-new-btn" onClick={() => setEditMemo({})}>
            ✏️ 새 메모
          </button>
        </div>
      </div>

      {/* 툴바 */}
      <div className="mp-toolbar">
        <div className="mp-search-wrap">
          <span style={{ flexShrink: 0 }}>🔍</span>
          <input className="mp-search-input" placeholder="제목, 내용, 태그 검색..."
            value={searchQ} onChange={e => setSearchQ(e.target.value)}/>
          {searchQ && <button className="mp-search-clear" onClick={() => setSearchQ('')}>✕</button>}
        </div>

        <div className="mp-tag-filter">
          <button className={`mp-filter-btn ${!filterTag ? 'active' : ''}`}
            onClick={() => setFilterTag('')}>
            전체 <span className="mp-count">{memos.length}</span>
          </button>
          {usedTags.map(t => {
            const cat   = categories.find(c => c.name === t)
            const color = cat?.color || '#94a3b8'
            const cnt   = memos.filter(m => m.tags?.includes(t)).length
            return (
              <button key={t}
                className={`mp-filter-btn ${filterTag === t ? 'active' : ''}`}
                style={filterTag === t
                  ? { background: color + '33', color, borderColor: color + '66' } : {}}
                onClick={() => setFilterTag(p => p === t ? '' : t)}>
                {t} <span className="mp-count">{cnt}</span>
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1 }}/>

        <select className="mp-select" value={sortBy}
          onChange={e => { setSortBy(e.target.value); lsSet(LS_SORT, e.target.value) }}>
          <option value="updated">수정일순</option>
          <option value="created">작성일순</option>
          <option value="title">제목순</option>
        </select>

        <div className="mp-view-btns">
          <button className={`mp-view-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => { setViewMode('grid'); lsSet(LS_VIEW, 'grid') }}>⊞</button>
          <button className={`mp-view-btn ${viewMode === 'list' ? 'active' : ''}`}
            onClick={() => { setViewMode('list'); lsSet(LS_VIEW, 'list') }}>☰</button>
        </div>
      </div>

      {/* 통계 */}
      {memos.length > 0 && (
        <div className="mp-stats">
          <span>📝 {memos.length}개</span>
          {pinnedCount > 0 && <span>📌 고정 {pinnedCount}개</span>}
          {filterTag && <span>🏷 {filterTag} {filtered.length}개</span>}
          {searchQ   && <span>🔍 "{searchQ}" → {filtered.length}개</span>}
        </div>
      )}

      {/* Firestore 오류 */}
      {loadError && (
        <div className="mp-load-error">
          ⚠️ {loadError}
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
            Firebase Console → Firestore → Rules 에서 users 컬렉션 읽기/쓰기 권한을 확인하세요
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="mp-loading"><div className="mp-spinner"/>불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="mp-empty">
          {memos.length === 0 ? (
            <>
              <div className="mp-empty-icon">📝</div>
              <p>첫 번째 메모를 작성해보세요</p>
              <p className="mp-empty-sub">투자 아이디어, 종목 분석, 매매 전략을 기록하세요</p>
              <button className="mp-new-btn" style={{ marginTop: 16 }}
                onClick={() => setEditMemo({})}>✏️ 새 메모 작성</button>
            </>
          ) : (
            <>
              <div className="mp-empty-icon">🔍</div>
              <p>검색 결과가 없습니다</p>
              <button className="mp-new-btn outline" style={{ marginTop: 12 }}
                onClick={() => { setSearchQ(''); setFilterTag('') }}>필터 초기화</button>
            </>
          )}
        </div>
      ) : (
        <div className={`mp-memo-grid ${viewMode}`}>
          {filtered.map(memo => (
            <MemoCard key={memo.id} memo={memo} categories={categories}
              onEdit={setEditMemo} onDelete={handleDelete} onPin={handlePin}/>
          ))}
        </div>
      )}

      {/* 에디터 */}
      {editMemo !== null && (
        <MemoEditor
          memo={editMemo.id ? editMemo : null}
          categories={categories}
          onSave={handleSave}
          onClose={() => setEditMemo(null)}/>
      )}

      {/* 카테고리 관리 */}
      {showCatMgr && (
        <CategoryManager
          categories={categories}
          onChange={handleCatsChange}
          onClose={() => setShowCatMgr(false)}/>
      )}

      <button className="mp-fab" onClick={() => setEditMemo({})} title="새 메모">✏️</button>
    </div>
  )
}
