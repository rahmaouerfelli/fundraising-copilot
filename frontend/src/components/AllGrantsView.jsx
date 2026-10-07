import { useEffect, useRef, useState } from 'react'
import { grantsApi, errorMessage } from '../api/client'
import { SECTORS, OTHER_SECTOR } from '../constants/sectors'
import GrantCard from './GrantCard'
import Pagination from './Pagination'
import SkeletonGrid from './SkeletonGrid'
import { useToast } from './Toast'

const PAGE_SIZE = 12
const SORTS = [
  ['recent', 'Newest'],
  ['deadline', 'Deadline (soonest)'],
  ['amount', 'Amount (highest)'],
]

const chip = (active) => ({
  padding: '7px 18px', borderRadius: 999, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: 13,
  background: active ? 'var(--primary)' : 'var(--surface-container)',
  color: active ? '#fff' : 'var(--on-surface)',
})

/**
 * Every open grant, paginated on the server (GET /grants/browse).
 * `refreshKey` changes when a scan finishes so the list reloads.
 */
export default function AllGrantsView({ refreshKey, onScan }) {
  const toast = useToast()
  const topRef = useRef(null)
  const [page, setPage] = useState(1)
  const [sector, setSector] = useState(null)
  const [sort, setSort] = useState('recent')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    grantsApi.browse({ page, page_size: PAGE_SIZE, sort, ...(sector ? { sector } : {}) })
      .then(r => {
        if (cancelled) return
        setData(r.data)
        if (r.data.page !== page) setPage(r.data.page)  // page out of range after a filter change
      })
      .catch(err => { if (!cancelled) toast.error('Could not load grants', { description: errorMessage(err) }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sector, sort, refreshKey])

  const changePage = (p) => {
    setPage(p)
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  const changeSector = (s) => { setSector(s); setPage(1) }
  const changeSort = (s) => { setSort(s); setPage(1) }

  const counts = data?.sector_counts || {}
  const chips = [...SECTORS, OTHER_SECTOR].filter(s => counts[s])
  const first = data && data.total ? (data.page - 1) * data.page_size + 1 : 0
  const last = data ? Math.min(data.page * data.page_size, data.total) : 0

  if (data && data.total_open === 0 && !loading) {
    return (
      <div className="glass-card" style={{ borderRadius: 28, padding: '48px 24px', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
        <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>No grants yet</h3>
        <p style={{ margin: '0 auto 20px', maxWidth: 420, color: 'var(--on-surface-variant)', fontSize: 14, lineHeight: 1.55 }}>
          Run a scan to collect open calls for proposals from the web. It takes about 1–2 minutes.
        </p>
        <button className="btn" onClick={onScan} style={{
          padding: '13px 26px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 14,
          background: 'var(--secondary)', color: 'var(--on-secondary)', boxShadow: '0 8px 20px -8px rgba(220,159,13,0.6)',
        }}>
          🔄 Scan for Grants
        </button>
      </div>
    )
  }

  return (
    <div ref={topRef} style={{ display: 'flex', flexDirection: 'column', gap: 28, scrollMarginTop: 110 }}>
      <div className="glass-card" style={{
        display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
        gap: 16, padding: 16, borderRadius: 20,
      }}>
        <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', maxWidth: '100%' }}>
          <button className="btn" onClick={() => changeSector(null)} aria-pressed={!sector} style={chip(!sector)}>
            All Grants <span style={{ opacity: 0.65, fontWeight: 600 }}>· {data?.total_open ?? '…'}</span>
          </button>
          {chips.map(s => (
            <button key={s} className="btn" onClick={() => changeSector(s)} aria-pressed={sector === s} style={chip(sector === s)}>
              {s} <span style={{ opacity: 0.65, fontWeight: 600 }}>· {counts[s]}</span>
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 12, color: 'var(--outline)', fontWeight: 600 }}>Sort by:</span>
          <select value={sort} onChange={e => changeSort(e.target.value)} style={{
            border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 700, fontSize: 13, cursor: 'pointer', outline: 'none',
          }}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      {data && data.total > 0 && (
        <div style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', fontWeight: 600, marginTop: -12 }}>
          Showing {first}–{last} of {data.total} grant{data.total > 1 ? 's' : ''}{sector ? ` in ${sector}` : ''}
        </div>
      )}

      {loading ? <SkeletonGrid count={Math.min(PAGE_SIZE, data?.items?.length || 6)} /> : (
        data?.items?.length ? (
          <div className="grant-grid fade-in" key={`${page}-${sector}-${sort}`}>
            {data.items.map(g => <GrantCard key={g.id} grant={g} highlightSector={sector} />)}
          </div>
        ) : (
          <div style={{ textAlign: 'center', padding: 48, color: '#94a3b8', fontSize: 15 }}>
            No open grants in this sector.
          </div>
        )
      )}

      {data && <Pagination page={data.page} pages={data.pages} onChange={changePage} disabled={loading} />}
    </div>
  )
}
