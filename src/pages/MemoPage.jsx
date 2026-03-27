import { useState, useEffect, useCallback, useRef } from 'react'
import { db } from '../firebase'
import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  onSnapshot, orderBy, query, Timestamp,
} from 'firebase/firestore'
import { useAuth } from '../context/AuthContext'
import MarkdownRenderer from '../components/ui/MarkdownRenderer'
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

// ── 기본 카테고리 ('기타' 하나만) ──────────────────────
const DEFAULT_CATEGORIES = [
  { name:'기타',     color:'#94a3b8' },
  { name:'AI브리핑', color:'#2563eb' },
]
const LS_TRASH_DAYS = 'mp_trash_days'
const TRASH_DAY_OPTIONS = [7, 30, 90]
const LS_CATS = 'mp_categories_v2'
const LS_VIEW = 'mp_view_v1'
const LS_SORT = 'mp_sort_v1'

function lsGet(k, d) { try { return JSON.parse(localStorage.getItem(k)) ?? d } catch { return d } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch {} }

// ── 색상 피커 ─────────────────────────────────────────
function ColorPicker({ value, onChange, colors, label }) {
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
        <div className="mp-cpicker-swatch" style={{ background: value }}/>
      </div>
      {open && (
        <div className="mp-cpicker-panel">
          <div className="mp-cpicker-grid">
            {colors.map(c => (
              <button key={c} className={`mp-cpicker-dot ${value === c ? 'selected' : ''}`}
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
            const isDefault = cat.name === '기타' || cat.name === 'AI브리핑'
            return (
              <div key={cat.name} className="mp-catmgr-item">
                <span className="mp-catmgr-dot" style={{ background: cat.color }}/>
                <span className="mp-catmgr-name">{cat.name}</span>
                {isDefault
                  ? <span className="mp-catmgr-default">기본</span>
                  : <button className="mp-catmgr-del"
                      onClick={() => onChange(categories.filter(c => c.name !== cat.name))}>🗑</button>
                }
              </div>
            )
          })}
        </div>
        <div className="mp-catmgr-footer">
          <span className="mp-catmgr-hint">기타·AI브리핑은 삭제할 수 없습니다</span>
          <button className="mp-save-btn" onClick={onClose}>완료</button>
        </div>
      </div>
    </div>
  )
}

// ── 메모 에디터 ───────────────────────────────────────
function MemoEditor({ memo, categories, onSave, onClose }) {
  const isNew    = !memo?.id
  const [title,      setTitle]      = useState(memo?.title    || '')
  const [content,    setContent]    = useState(memo?.content  || '')
  const [bgColor,    setBgColor]    = useState(memo?.bgColor  || '#FFFFFF')
  const [titleColor, setTitleColor] = useState(memo?.titleColor || '#0F172A')
  const [textColor,  setTextColor]  = useState(memo?.textColor  || '#334155')
  const [fontSize,   setFontSize]   = useState(memo?.fontSize   || 14)
  const [category,   setCategory]   = useState(memo?.category   || '')
  const [tags,       setTags]       = useState(memo?.tags       || [])
  const [tagInput,   setTagInput]   = useState('')
  const [saving,     setSaving]     = useState(false)
  const [saveError,  setSaveError]  = useState('')
  const [saveOk,     setSaveOk]     = useState(false)
  // 기존 메모 → 기본 읽기모드, 새 메모 → 편집모드
  const [editMode,   setEditMode]   = useState(isNew)
  const textRef = useRef(null)

  // 태그 추가 (직접 입력)
  const addTag = () => {
    const t = tagInput.trim()
    if (!t || tags.includes(t)) { setTagInput(''); return }
    setTags(prev => [...prev, t])
    setTagInput('')
  }
  const removeTag = name => setTags(prev => prev.filter(t => t !== name))

  async function handleSave() {
    if (!title.trim() && !content.trim()) { setSaveError('제목 또는 내용을 입력해주세요'); return }
    setSaving(true); setSaveError('')
    try {
      await onSave({ title, content, bgColor, titleColor, textColor, fontSize, category, tags })
      setSaveOk(true)
      setTimeout(() => { setSaveOk(false); setEditMode(false) }, 600)
    } catch (e) {
      console.error('저장 오류:', e)
      setSaveError('저장 실패: ' + (e.message || '다시 시도해주세요'))
    } finally { setSaving(false) }
  }

  // 키보드 단축키
  function handleKeyDown(e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onClose()
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.target, s = ta.selectionStart, v = ta.value
      ta.value = v.slice(0, s) + '  ' + v.slice(s)
      ta.selectionStart = ta.selectionEnd = s + 2
      setContent(ta.value)
    }
  }

  // 편집 도구 삽입 헬퍼
  const insertAt = ins => {
    const ta = textRef.current; if (!ta) return
    const s = ta.selectionStart, v = ta.value
    const before = v.slice(0, s), after = v.slice(s)
    const prefix = (before.length === 0 || before.endsWith('\n')) ? '' : '\n'
    const next = before + prefix + ins + after
    setContent(next)
    setTimeout(() => { ta.selectionStart = ta.selectionEnd = s + prefix.length + ins.length; ta.focus() }, 0)
  }

  const selectedCat = categories.find(c => c.name === category)

  return (
    <div className="mp-modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className={`mp-editor mp-editor-resizable ${!editMode ? 'read-mode' : ''}`}
        style={{ background: bgColor }}>

        {/* ── 읽기모드 헤더 ── */}
        {!editMode && (
          <div className="mp-read-header">
            <div className="mp-read-header-left">
              {selectedCat && (
                <span className="mp-cat-badge" style={{ background: selectedCat.color+'22', color: selectedCat.color, borderColor: selectedCat.color+'44' }}>
                  📁 {selectedCat.name}
                </span>
              )}
              {tags.map(t => <span key={t} className="mp-tag-chip">#{t}</span>)}
            </div>
            <div className="mp-read-header-right">
              <button className="mp-read-edit-btn" onClick={() => setEditMode(true)}>✏️ 수정</button>
              <button className="mp-icon-btn" onClick={onClose}>✕</button>
            </div>
          </div>
        )}

        {/* ── 편집모드 툴바 ── */}
        {editMode && (
          <div className="mp-editor-toolbar">
            <div className="mp-toolbar-row">
              <ColorPicker value={bgColor}    onChange={setBgColor}    colors={BG_COLORS}   label="배경"/>
              <ColorPicker value={textColor}  onChange={setTextColor}  colors={TEXT_COLORS} label="글자"/>
              <ColorPicker value={titleColor} onChange={setTitleColor} colors={TEXT_COLORS} label="제목"/>
              <div className="mp-toolbar-sep"/>
              <div className="mp-toolbar-group">
                <span className="mp-cpicker-label">크기</span>
                <select className="mp-select" value={fontSize} onChange={e => setFontSize(Number(e.target.value))}>
                  {FONT_SIZES.map(s => <option key={s} value={s}>{s}px</option>)}
                </select>
              </div>
              <div className="mp-toolbar-group">
                <button className="mp-fmt-btn" title="굵게"   onClick={() => insertAt('**')}><b>B</b></button>
                <button className="mp-fmt-btn" title="기울임" onClick={() => insertAt('*')}><i>I</i></button>
              </div>
              <div className="mp-toolbar-sep"/>
              <div className="mp-toolbar-group">
                <button className="mp-fmt-btn mp-fmt-wide" onClick={() => insertAt('• ')}>• 목록</button>
                <button className="mp-fmt-btn mp-fmt-wide" onClick={() => insertAt('## ')}>## 제목</button>
                <button className="mp-fmt-btn mp-fmt-wide" onClick={() => insertAt('---\n')}>── 구분</button>
              </div>
              <div style={{ flex: 1 }}/>
              <button className={`mp-save-btn ${saveOk ? 'ok' : ''}`}
                onClick={handleSave} disabled={saving}>
                {saving ? '⟳...' : saveOk ? '✅' : '💾 저장'}
              </button>
              <button className="mp-icon-btn" onClick={onClose} style={{ marginLeft: 4 }}>✕</button>
            </div>

            {saveError && <div className="mp-save-error">⚠️ {saveError}</div>}

            <div className="mp-meta-row">
              <span className="mp-meta-label">📁</span>
              <select className="mp-cat-select" value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">없음</option>
                {categories.map(cat => <option key={cat.name} value={cat.name}>{cat.name}</option>)}
              </select>
              {selectedCat && (
                <span className="mp-cat-badge" style={{ background: selectedCat.color+'22', color: selectedCat.color, borderColor: selectedCat.color+'44' }}>
                  {selectedCat.name}
                  <button className="mp-tag-x" onClick={() => setCategory('')}>×</button>
                </span>
              )}
              <div className="mp-toolbar-sep"/>
              <span className="mp-meta-label">🏷</span>
              <div className="mp-selected-tags">
                {tags.map(t => (
                  <span key={t} className="mp-tag-chip-edit">
                    #{t}<button className="mp-tag-x" onClick={() => removeTag(t)}>×</button>
                  </span>
                ))}
              </div>
              <input className="mp-tag-input" placeholder="태그 입력 후 엔터"
                value={tagInput} onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTag() }}}/>
            </div>
          </div>
        )}

        {/* 제목 */}
        {editMode ? (
          <input className="mp-title-input"
            style={{ color: titleColor, fontSize: Math.min(fontSize + 6, 28) + 'px' }}
            placeholder="제목을 입력하세요..."
            value={title} onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); textRef.current?.focus() }}}/>
        ) : (
          <div className="mp-read-title" style={{ color: titleColor, fontSize: Math.min(fontSize + 6, 28) + 'px' }}>
            {title || '제목 없음'}
          </div>
        )}

        {/* 본문 */}
        {editMode ? (
          <textarea ref={textRef} className="mp-content-input"
            style={{ color: textColor, fontSize: fontSize + 'px', background: 'transparent' }}
            placeholder={'내용을 입력하세요...\n\n• 투자 아이디어\n• 종목 분석 메모\n• 매매 전략\n• 공부 내용'}
            value={content} onChange={e => setContent(e.target.value)}
            onKeyDown={handleKeyDown}/>
        ) : (
          <div className="mp-content-preview" style={{ color: textColor, fontSize: fontSize + 'px' }}>
            <MarkdownRenderer text={content}/>
          </div>
        )}

        {/* 하단 */}
        <div className="mp-editor-footer">
          {editMode ? (
            <>
              <span style={{ color: textColor, opacity: 0.4, fontSize: 11 }}>
                {content.length}자 · Ctrl+S 저장 · ESC 닫기
              </span>
              <button className="mp-read-cancel-btn" onClick={() => isNew ? onClose() : setEditMode(false)}>
                {isNew ? '취소' : '읽기모드로'}
              </button>
            </>
          ) : (
            <span style={{ color: textColor, opacity: 0.4, fontSize: 11 }}>
              {memo?.updatedAt?.toDate?.()?.toLocaleString('ko-KR') || ''}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── 메모 카드 ─────────────────────────────────────────
function MemoCard({ memo, categories, viewMode, isTrash, onEdit, onDelete, onRestore, onPermanentDelete, onPin }) {
  const [confirm, setConfirm] = useState(false)
  const isAiBriefing = memo.category === 'AI브리핑'
  const lines   = (memo.content || '').split('\n').filter(Boolean)
  const preview = lines.slice(0, 4).join('\n')
  const hasMore = lines.length > 4
  const cat     = categories.find(c => c.name === memo.category)
  const dateStr = memo.updatedAt?.toDate?.()?.toLocaleDateString('ko-KR') || ''

  // 리스트 모드 — 제목 + 날짜만
  if (viewMode === 'list') {
    return (
      <div className="mp-list-row" onClick={() => onEdit?.(memo)}>
        <div className="mp-list-left">
          {memo.pinned && <span className="mp-pin-sm">📌</span>}
          {cat && <span className="mp-list-cat" style={{ background: cat.color+'20', color: cat.color }}>{cat.name}</span>}
          <span className="mp-list-title">{memo.title || '제목 없음'}</span>
        </div>
        <div className="mp-list-right">
          <span className="mp-list-date">{dateStr}</span>
          {isTrash ? (
            <div className="mp-list-actions" onClick={e => e.stopPropagation()}>
              <button className="mp-action-btn" onClick={() => onRestore(memo.id)}>↩ 복원</button>
              <button className="mp-action-btn danger" onClick={() => onPermanentDelete(memo.id)}>🗑 영구삭제</button>
            </div>
          ) : (
            <div className="mp-list-actions" onClick={e => e.stopPropagation()}>
              <button className="mp-action-btn" onClick={() => onPin(memo)}>{memo.pinned ? '📌' : '📍'}</button>
              <button className="mp-action-btn danger" onClick={() => onDelete(memo.id)}>🗑</button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // 그리드 모드
  return (
    <div className="mp-card"
      style={{ background: memo.bgColor || '#FFFFFF', borderColor: memo.pinned ? '#f59e0b' : 'var(--border)' }}
      onClick={() => onEdit?.(memo)}>

      {memo.pinned && <div className="mp-pin-badge">📌</div>}

      {cat && (
        <div className="mp-card-cat-row" onClick={e => e.stopPropagation()}>
          <span className="mp-card-cat-badge"
            style={{ background: cat.color+'22', color: cat.color, borderColor: cat.color+'44' }}>
            📁 {cat.name}
          </span>
        </div>
      )}

      {memo.tags?.length > 0 && (
        <div className="mp-card-tags" onClick={e => e.stopPropagation()}>
          {memo.tags.map(t => <span key={t} className="mp-tag-chip">#{t}</span>)}
        </div>
      )}

      <div className="mp-card-title" style={{ color: memo.titleColor || 'var(--text-primary)' }}>
        {memo.title || '제목 없음'}
      </div>

      {isAiBriefing ? (
        <div className="mp-card-md-preview" onClick={e => e.stopPropagation()}>
          <MarkdownRenderer text={preview} className="ai-briefing-card"/>
          {hasMore && <div className="mp-card-more">...더 보기</div>}
        </div>
      ) : (
        <>
          <pre className="mp-card-preview"
            style={{ color: memo.textColor || 'var(--text-secondary)', fontSize: Math.min(memo.fontSize || 13, 14) + 'px' }}>
            {preview}
          </pre>
          {hasMore && <div className="mp-card-more" style={{ color: memo.textColor || 'var(--text-dim)', opacity: 0.5 }}>...더 보기</div>}
        </>
      )}

      <div className="mp-card-footer">
        <span className="mp-card-date">{dateStr}</span>
        <div className="mp-card-actions" onClick={e => e.stopPropagation()}>
          {isTrash ? (
            <>
              <button className="mp-action-btn" onClick={() => onRestore(memo.id)}>↩</button>
              {confirm ? (
                <>
                  <button className="mp-action-btn danger" onClick={() => onPermanentDelete(memo.id)}>영구삭제</button>
                  <button className="mp-action-btn" onClick={() => setConfirm(false)}>취소</button>
                </>
              ) : (
                <button className="mp-action-btn danger" onClick={() => setConfirm(true)}>🗑</button>
              )}
            </>
          ) : (
            <>
              <button className="mp-action-btn" onClick={() => onPin(memo)}>{memo.pinned ? '📌' : '📍'}</button>
              {confirm ? (
                <>
                  <button className="mp-action-btn danger" onClick={() => onDelete(memo.id)}>삭제</button>
                  <button className="mp-action-btn" onClick={() => setConfirm(false)}>취소</button>
                </>
              ) : (
                <button className="mp-action-btn danger" onClick={() => setConfirm(true)}>🗑</button>
              )}
            </>
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
  const [memos,       setMemos]       = useState([])
  const [loading,     setLoading]     = useState(true)
  const [loadError,   setLoadError]   = useState('')
  const [editMemo,    setEditMemo]    = useState(null)
  const [searchQ,     setSearchQ]     = useState('')
  const [filterCat,   setFilterCat]   = useState('')   // 카테고리 필터
  const [filterTag,   setFilterTag]   = useState('')   // 태그 필터
  const [sortBy,      setSortBy]      = useState(() => lsGet(LS_SORT, 'updated'))
  const [viewMode,    setViewMode]    = useState(() => lsGet(LS_VIEW, 'grid'))
  const [showCatMgr,  setShowCatMgr]  = useState(false)
  const [categories,  setCategories]  = useState(() => lsGet(LS_CATS, null) || DEFAULT_CATEGORIES)

  const handleCatsChange = cats => { setCategories(cats); lsSet(LS_CATS, cats) }
  const [trashDays,   setTrashDays]  = useState(() => lsGet(LS_TRASH_DAYS, 30))
  const [showTrash,   setShowTrash]  = useState(false)

  const handleTrashDaysChange = d => { setTrashDays(d); lsSet(LS_TRASH_DAYS, d) }

  // Firestore 구독
  useEffect(() => {
    if (!user) return
    const q = query(collection(db, 'users', user.uid, 'memos'), orderBy('updatedAt', 'desc'))
    const unsub = onSnapshot(q,
      snap => { setMemos(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false) },
      err  => { setLoadError('Firestore 오류: ' + err.message); setLoading(false) }
    )
    return () => unsub()
  }, [user])

  // 휴지통 자동 정리 — trashDays 경과한 메모 영구 삭제
  useEffect(() => {
    if (!user || !memos.length) return
    const limit = Date.now() - trashDays * 86400000
    const expired = memos.filter(m => m.deletedAt && m.deletedAt.toMillis?.() < limit)
    expired.forEach(m => deleteDoc(doc(db, 'users', user.uid, 'memos', m.id)).catch(() => {}))
  }, [memos, user, trashDays])

  // AI브리핑 localStorage → Firestore 자동 동기화
  useEffect(() => {
    if (!user) return
    const LS_AI = 'ai_briefing_memos'
    const pending = JSON.parse(localStorage.getItem(LS_AI) || '[]')
    if (!pending.length) return
    const now = Timestamp.fromDate(new Date())
    Promise.all(pending.map(entry =>
      addDoc(collection(db, 'users', user.uid, 'memos'), {
        title:      entry.title,
        content:    entry.content,
        category:   'AI브리핑',
        tags:       ['AI', '자동저장'],
        bgColor:    '#EFF6FF',
        titleColor: '#1E40AF',
        textColor:  '#1E293B',
        fontSize:   13,
        pinned:     false,
        createdAt:  now,
        updatedAt:  now,
      })
    )).then(() => {
      localStorage.removeItem(LS_AI)
    }).catch(e => console.warn('[MemoPage] AI브리핑 동기화 실패:', e.message))
  }, [user])

  // 저장
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

  // 소프트 삭제 (휴지통 이동)
  const handleDelete = useCallback(async id => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'memos', id),
      { deletedAt: Timestamp.fromDate(new Date()) })
  }, [user])

  // 복원
  const handleRestore = useCallback(async id => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'memos', id), { deletedAt: null })
  }, [user])

  // 영구 삭제
  const handlePermanentDelete = useCallback(async id => {
    if (!user) return
    await deleteDoc(doc(db, 'users', user.uid, 'memos', id))
  }, [user])

  const handlePin = useCallback(async memo => {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid, 'memos', memo.id),
      { pinned: !memo.pinned, updatedAt: Timestamp.fromDate(new Date()) })
  }, [user])

  // 실제 사용 중인 카테고리·태그만 추출
  const activeMemos = memos.filter(m => !m.deletedAt)
  const trashMemos  = memos.filter(m =>  m.deletedAt)
  const displayMemos = showTrash ? trashMemos : activeMemos

  const filtered = displayMemos
    .filter(m => {
      if (filterCat && m.category !== filterCat) return false
      if (filterTag && !m.tags?.includes(filterTag)) return false
      if (searchQ) {
        const q = searchQ.toLowerCase()
        return (m.title || '').toLowerCase().includes(q)
          || (m.content || '').toLowerCase().includes(q)
          || m.tags?.some(t => t.toLowerCase().includes(q))
          || (m.category || '').toLowerCase().includes(q)
      }
      return true
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)
      if (sortBy === 'title')   return (a.title || '').localeCompare(b.title || '')
      if (sortBy === 'created') return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)
      return (b.updatedAt?.toMillis?.() ?? 0) - (a.updatedAt?.toMillis?.() ?? 0)
    })

  const usedCats    = [...new Set(activeMemos.map(m => m.category).filter(Boolean))]
  const usedTags    = [...new Set(activeMemos.flatMap(m => m.tags || []))]
  const pinnedCount = activeMemos.filter(m => m.pinned).length

  return (
    <div className="mp-wrap">

      {/* 헤더 */}
      <div className="mp-page-header">
        <div>
          <h1 className="page-title">📝 메모장</h1>
          <p className="page-sub">투자 아이디어 · 종목 분석 · 매매 전략 · 공부 기록</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 휴지통 보관기간 */}
          <div className="mp-trash-setting">
            <span className="mp-trash-label">🗑 보관</span>
            {TRASH_DAY_OPTIONS.map(d => (
              <button key={d}
                className={`mp-trash-day-btn ${trashDays === d ? 'active' : ''}`}
                onClick={() => handleTrashDaysChange(d)}>{d}일</button>
            ))}
          </div>
          <button
            className={`mp-cat-mgr-btn ${showTrash ? 'active' : ''}`}
            onClick={() => { setShowTrash(v => !v); setFilterCat(''); setFilterTag('') }}>
            🗑 휴지통 {trashMemos.length > 0 && <span className="mp-count">{trashMemos.length}</span>}
          </button>
          <button className="mp-cat-mgr-btn" onClick={() => setShowCatMgr(true)}>🏷 카테고리</button>
          {!showTrash && <button className="mp-new-btn" onClick={() => setEditMemo({})}>✏️ 새 메모</button>}
        </div>
      </div>

      {/* 검색 + 필터 */}
      <div className="mp-toolbar">
        <div className="mp-search-wrap">
          <span style={{ flexShrink: 0 }}>🔍</span>
          <input className="mp-search-input" placeholder="제목, 내용, 카테고리, 태그 검색..."
            value={searchQ} onChange={e => setSearchQ(e.target.value)}/>
          {searchQ && <button className="mp-search-clear" onClick={() => setSearchQ('')}>✕</button>}
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

      {/* ── 카테고리 필터 ── */}
      {usedCats.length > 0 && (
        <div className="mp-filter-section">
          <span className="mp-filter-label">📁 카테고리</span>
          <div className="mp-filter-chips">
            <button className={`mp-filter-btn ${!filterCat ? 'active' : ''}`}
              onClick={() => setFilterCat('')}>
              전체 <span className="mp-count">{memos.length}</span>
            </button>
            {usedCats.map(name => {
              const cat   = categories.find(c => c.name === name)
              const color = cat?.color || '#94a3b8'
              const cnt   = memos.filter(m => m.category === name).length
              return (
                <button key={name}
                  className={`mp-filter-btn ${filterCat === name ? 'active' : ''}`}
                  style={filterCat === name ? { background: color+'33', color, borderColor: color+'66' } : {}}
                  onClick={() => setFilterCat(p => p === name ? '' : name)}>
                  {name} <span className="mp-count">{cnt}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 태그 필터 ── */}
      {usedTags.length > 0 && (
        <div className="mp-filter-section">
          <span className="mp-filter-label">🏷 태그</span>
          <div className="mp-filter-chips">
            {usedTags.map(t => {
              const cnt = memos.filter(m => m.tags?.includes(t)).length
              return (
                <button key={t}
                  className={`mp-filter-btn tag-style ${filterTag === t ? 'active-tag' : ''}`}
                  onClick={() => setFilterTag(p => p === t ? '' : t)}>
                  #{t} <span className="mp-count">{cnt}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* 통계 */}
      {(filterCat || filterTag || searchQ) && (
        <div className="mp-stats">
          <span>📝 {filtered.length} / {memos.length}개</span>
          {filterCat && <span>📁 {filterCat}</span>}
          {filterTag && <span>🏷 #{filterTag}</span>}
          {searchQ   && <span>🔍 "{searchQ}"</span>}
          <button className="mp-clear-filter"
            onClick={() => { setFilterCat(''); setFilterTag(''); setSearchQ('') }}>
            필터 초기화
          </button>
        </div>
      )}
      {!filterCat && !filterTag && !searchQ && memos.length > 0 && (
        <div className="mp-stats">
          <span>📝 {memos.length}개</span>
          {pinnedCount > 0 && <span>📌 고정 {pinnedCount}개</span>}
        </div>
      )}

      {loadError && (
        <div className="mp-load-error">
          ⚠️ {loadError}
          <div style={{ fontSize: 11, marginTop: 6, opacity: 0.7 }}>
            Firebase Console → Firestore → Rules 에서 users 컬렉션 권한을 확인하세요
          </div>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="mp-loading"><div className="mp-spinner"/>불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="mp-empty">
          {showTrash ? (
            <>
              <div className="mp-empty-icon">🗑</div>
              <p>휴지통이 비어있습니다</p>
            </>
          ) : activeMemos.length === 0 ? (
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
                onClick={() => { setSearchQ(''); setFilterCat(''); setFilterTag('') }}>필터 초기화</button>
            </>
          )}
        </div>
      ) : (
        <div className={`mp-memo-grid ${viewMode}`}>
          {filtered.map(memo => (
            <MemoCard key={memo.id} memo={memo} categories={categories}
              viewMode={viewMode}
              isTrash={showTrash}
              onEdit={showTrash ? null : setEditMemo}
              onDelete={handleDelete}
              onRestore={handleRestore}
              onPermanentDelete={handlePermanentDelete}
              onPin={handlePin}/>
          ))}
        </div>
      )}

      {editMemo !== null && (
        <MemoEditor
          memo={editMemo.id ? editMemo : null}
          categories={categories}
          onSave={handleSave}
          onClose={() => setEditMemo(null)}/>
      )}

      {showCatMgr && (
        <CategoryManager categories={categories} onChange={handleCatsChange}
          onClose={() => setShowCatMgr(false)}/>
      )}

      <button className="mp-fab" onClick={() => setEditMemo({})} title="새 메모">✏️</button>
    </div>
  )
}
