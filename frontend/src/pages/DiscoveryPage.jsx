import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { grantsApi, matchesApi, errorMessage } from '../api/client'
import { useApp } from '../context/AppContext'
import GrantCard from '../components/GrantCard'
import AllGrantsView from '../components/AllGrantsView'
import SkeletonGrid from '../components/SkeletonGrid'
import ScanProgressModal, { scanPercent } from '../components/ScanProgressModal'
import { useToast } from '../components/Toast'
import { SECTORS, OTHER_SECTOR } from '../constants/sectors'

const SORTS = [
  ['relevance', 'Relevance'],
  ['deadline', 'Deadline'],
  ['amount', 'Amount'],
]

function sortGrants(grants, sort) {
  const list = [...grants]
  if (sort === 'deadline') {
    list.sort((a, b) => {
      if (!a.deadline) return 1
      if (!b.deadline) return -1
      return new Date(a.deadline) - new Date(b.deadline)
    })
  } else if (sort === 'amount') {
    list.sort((a, b) => (b.amount_max || 0) - (a.amount_max || 0))
  } else {
    list.sort((a, b) => (b._score || 0) - (a._score || 0))
  }
  return list
}

export default function DiscoveryPage() {
  const { activeNgo } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const [mode, setMode] = useState('ai')  // 'ai' | 'all' | 'search' | 'chat'
  const [refreshKey, setRefreshKey] = useState(0)  // bumped after a scan so All Grants reloads
  const [grants, setGrants] = useState([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [scan, setScan] = useState(null)  // live progress from /grants/ingest/status
  const [scanOpen, setScanOpen] = useState(false)  // centered dialog visible (vs minimized)
  const scanOpenRef = useRef(false)
  const pollRef = useRef(null)
  const [sector, setSector] = useState('all')
  const [sort, setSort] = useState('relevance')
  const [visible, setVisible] = useState(9)
  const [hasSearched, setHasSearched] = useState(false)
  const [searchedQuery, setSearchedQuery] = useState('')  // query of the results on screen

  const ingesting = !!scan?.running
  useEffect(() => { scanOpenRef.current = scanOpen }, [scanOpen])

  const requireNgo = () => {
    if (activeNgo) return true
    toast.warning('Set up your NGO profile first', {
      description: 'AI matches are based on your mission, sectors and country.',
      action: { label: 'Complete profile', onClick: () => navigate('/onboarding') },
    })
    return false
  }

  const loadAiMatches = async () => {
    if (!requireNgo()) return
    setMode('ai')
    setLoading(true)
    setGrants([])
    try {
      const res = await matchesApi.getMatches(activeNgo.id, 10)
      setGrants(res.data.map(m => ({ ...m.grant, _score: m.match_score, _explanation: m.explanation })))
      setVisible(9)
      setSector('all')
      if (res.data.length === 0) {
        toast.info('No matches yet', { description: 'Run a scan to collect grant opportunities first.' })
      }
    } catch (err) {
      toast.error('Could not load AI matches', { description: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  const runSearch = async (searchMode, searchQuery) => {
    setLoading(true)
    setGrants([])
    try {
      const res = searchMode === 'chat'
        ? await grantsApi.conversationalSearch(searchQuery)
        : await grantsApi.search({ query: searchQuery, limit: 50 })
      setGrants(res.data)
      setVisible(9)
      setSector('all')
      setHasSearched(true)
      setSearchedQuery(searchQuery.trim())
    } catch (err) {
      toast.error('Search failed', { description: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e?.preventDefault()
    if (mode === 'chat' && !query.trim()) {
      toast.info('Describe what you are looking for', { description: 'e.g. "education grants in Tunisia under $50k".' })
      return
    }
    runSearch(mode, query)
  }

  const browseAll = () => {
    setScanOpen(false)
    setMode('all')
  }

  const viewMatches = () => {
    setScanOpen(false)
    loadAiMatches()
  }

  const stopPolling = () => { clearInterval(pollRef.current); pollRef.current = null }

  const onScanFinished = (data) => {
    // Dialog open: its summary screen says it all. Minimized: tell the user with a toast.
    if (scanOpenRef.current) return
    if (data.phase === 'failed') {
      toast.error('The grant scan failed', {
        description: data.error || 'Unexpected error.',
        action: { label: 'Show details', onClick: () => setScanOpen(true) },
      })
      return
    }
    const r = data.last_result
    if (!r) return
    const found = r.total_new_grants
    const show = found > 0 ? toast.success : r.stopped_reason ? toast.warning : toast.info
    show(found > 0 ? `${found} new grant${found > 1 ? 's' : ''} found` : 'Scan complete — no new grants', {
      description: r.stopped_reason || `${r.sources_scanned} pages scanned in ${Math.round(r.duration_seconds)} s.`,
      action: found > 0 ? { label: 'See my AI matches', onClick: viewMatches } : { label: 'Show summary', onClick: () => setScanOpen(true) },
    })
  }

  // The scan runs in the background on the server: poll its progress until it finishes.
  const pollScan = () => {
    stopPolling()
    pollRef.current = setInterval(async () => {
      try {
        const { data } = await grantsApi.ingestionStatus()
        setScan(data)
        if (data.running) return
        stopPolling()
        setRefreshKey(k => k + 1)
        onScanFinished(data)
      } catch {
        // transient network error — keep polling
      }
    }, 1500)
  }

  // Resume the progress display if a scan is already running (page reload, scheduled scan).
  useEffect(() => {
    grantsApi.ingestionStatus().then(({ data }) => {
      if (data.running) { setScan(data); pollScan() }
    }).catch(() => {})
    return stopPolling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleIngest = async () => {
    if (ingesting) { setScanOpen(true); return }
    try {
      const { data } = await grantsApi.triggerIngestion()
      setScan(data)
      setScanOpen(true)
      pollScan()
    } catch (err) {
      if (err?.response?.status === 409) { setScanOpen(true); pollScan(); return }  // already running: follow it
      toast.error('Could not start the scan', { description: errorMessage(err) })
    }
  }

  const minimizeScan = () => {
    setScanOpen(false)
    toast.info('Scan continues in the background', {
      description: 'You will be notified when it finishes. Click the scan button to see the progress.',
      duration: 4000,
    })
  }

  // One chip per canonical sector present in the results, with its count (a grant can be in several).
  const sectors = useMemo(() => {
    const counts = {}
    grants.forEach(g => (g.sectors || []).forEach(s => { counts[s] = (counts[s] || 0) + 1 }))
    return [...SECTORS, OTHER_SECTOR].filter(s => counts[s]).map(s => ({ name: s, count: counts[s] }))
  }, [grants])

  const filtered = useMemo(() => {
    const base = sector === 'all' ? grants : grants.filter(g => (g.sectors || []).includes(sector))
    return sortGrants(base, sort)
  }, [grants, sector, sort])

  const shown = filtered.slice(0, visible)
  const percent = scanPercent(scan)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 40 }}>
      {scanOpen && scan && (
        <ScanProgressModal
          progress={scan}
          onMinimize={minimizeScan}
          onClose={() => setScanOpen(false)}
          onViewMatches={viewMatches}
          onBrowseAll={browseAll}
          onRetry={() => { setScanOpen(false); handleIngest() }}
        />
      )}

      {/* Header */}
      <header style={{ textAlign: 'center', paddingTop: 8 }} className="pop-in">
        <h1 className="display" style={{ fontSize: 44, fontWeight: 800, margin: '0 0 14px', letterSpacing: -0.5 }}>
          Discover <span className="text-gradient-primary">Opportunities</span>
        </h1>
        <p style={{ color: 'var(--on-surface-variant)', fontSize: 16, maxWidth: 640, margin: '0 auto', lineHeight: 1.6 }}>
          Explore grants matched to your mission with AI, or search and browse opportunities yourself.
        </p>
      </header>

      {/* Mode tabs + scan */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
        {[['ai', '✨ AI Matches'], ['all', '📚 All Grants'], ['search', 'Keyword Search'], ['chat', 'Conversational']].map(([m, label]) => (
          <button key={m} className="btn" onClick={() => setMode(m)} aria-pressed={mode === m} style={{
            padding: '9px 20px', borderRadius: 999, fontWeight: 700, fontSize: 13,
            border: `1.5px solid ${mode === m ? 'var(--primary)' : 'var(--outline-variant)'}`,
            background: mode === m ? 'rgba(27,79,145,0.08)' : 'transparent', color: mode === m ? 'var(--primary)' : 'var(--on-surface-variant)',
            cursor: 'pointer',
          }}>
            {label}
          </button>
        ))}
        <button
          className="btn"
          onClick={handleIngest}
          aria-label={ingesting ? `Scan in progress, ${percent}% — show progress` : 'Scan for grants'}
          style={{
            position: 'relative', overflow: 'hidden', padding: '9px 20px', borderRadius: 999, cursor: 'pointer',
            border: `1.5px solid ${ingesting ? 'var(--primary)' : 'var(--outline-variant)'}`,
            background: 'transparent', fontSize: 13, fontWeight: 700,
            color: ingesting ? 'var(--primary)' : 'var(--on-surface-variant)', minWidth: 170,
          }}
        >
          {ingesting && (
            <span aria-hidden className="progress-stripes" style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, width: `${percent}%`,
              background: 'rgba(27,79,145,0.12)', transition: 'width 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
            }} />
          )}
          <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {ingesting ? (
              <>
                <span className="spin" style={{ width: 12, height: 12, borderRadius: '50%', border: '2px solid #93c5fd', borderTopColor: 'var(--primary)', display: 'inline-block' }} />
                Scanning… {percent}%
              </>
            ) : '🔄 Scan for Grants'}
          </span>
        </button>
      </div>

      {mode === 'ai' && (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="btn" onClick={loadAiMatches} disabled={loading} style={{
            padding: '15px 32px', borderRadius: 999, border: 'none',
            background: 'var(--secondary)', color: 'var(--on-secondary)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 8px 20px -8px rgba(220,159,13,0.5)',
          }}>
            {loading ? 'Finding matches…' : '✨ Get AI Recommendations'}
          </button>
        </div>
      )}

      {(mode === 'search' || mode === 'chat') && (
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: 10, maxWidth: 640, margin: '0 auto', width: '100%' }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={mode === 'chat'
              ? 'e.g. "grants for disability inclusion in North Africa under $50k"'
              : 'Search by title, sector, funder…'}
            style={{ flex: 1, border: '1.5px solid var(--outline-variant)', borderRadius: 999, padding: '13px 20px', fontSize: 14, outline: 'none', background: 'var(--surface-container-low)' }}
          />
          <button className="btn" type="submit" disabled={loading} style={{
            padding: '13px 26px', borderRadius: 999, border: 'none',
            background: 'var(--secondary)', color: 'var(--on-secondary)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
            boxShadow: '0 8px 20px -8px rgba(220,159,13,0.5)',
          }}>
            {loading ? 'Searching…' : 'Search'}
          </button>
        </form>
      )}

      {mode === 'all' && <AllGrantsView refreshKey={refreshKey} onScan={handleIngest} />}

      {mode !== 'all' && (<>
      {/* Filter & sort bar */}
      {grants.length > 0 && (
        <div className="glass-card" style={{
          display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center',
          gap: 16, padding: 16, borderRadius: 20,
        }}>
          <div className="hide-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
            <button className="btn" onClick={() => setSector('all')} style={{
              padding: '7px 18px', borderRadius: 999, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
              fontWeight: 700, fontSize: 13,
              background: sector === 'all' ? 'var(--primary)' : 'var(--surface-container)',
              color: sector === 'all' ? '#fff' : 'var(--on-surface)',
            }}>
              All Grants · {grants.length}
            </button>
            {sectors.map(({ name, count }) => (
              <button key={name} className="btn" onClick={() => setSector(name)} aria-pressed={sector === name} style={{
                padding: '7px 18px', borderRadius: 999, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer',
                fontWeight: 700, fontSize: 13,
                background: sector === name ? 'var(--primary)' : 'var(--surface-container)',
                color: sector === name ? '#fff' : 'var(--on-surface)',
              }}>
                {name} <span style={{ opacity: 0.65, fontWeight: 600 }}>· {count}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--outline)', fontWeight: 600 }}>Sort by:</span>
            <select value={sort} onChange={e => setSort(e.target.value)} style={{
              border: 'none', background: 'transparent', color: 'var(--primary)', fontWeight: 700, fontSize: 13, cursor: 'pointer', outline: 'none',
            }}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* Results */}
      {(mode === 'search' || mode === 'chat') && hasSearched && !loading && grants.length > 0 && (
        <div style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', fontWeight: 600, marginTop: -16 }}>
          {grants.length} grant{grants.length > 1 ? 's' : ''} match{grants.length > 1 ? '' : 'es'}
          {searchedQuery ? <> “<strong style={{ color: 'var(--on-surface)' }}>{searchedQuery}</strong>”</> : ' your search'}
          {sector !== 'all' && <> · showing {filtered.length} in {sector}</>}
        </div>
      )}
      {loading && <SkeletonGrid />}

      {filtered.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', fontSize: 15 }}>
          {mode === 'ai'
            ? 'Click "Get AI Recommendations" to find matching grants.'
            : !hasSearched
              ? (mode === 'search' ? 'Type a keyword (title, funder, topic…). To see everything, open the "All Grants" tab.' : 'Describe the funding you are looking for.')
              : grants.length === 0
                ? `No open grant mentions "${searchedQuery}". Try a broader word (e.g. a sector like "education"), or browse the All Grants tab.`
                : 'No grants match this filter.'}
        </div>
      )}

      {shown.length > 0 && (
        <div className="grant-grid">
          {shown.map(g => (
            <GrantCard key={g.id} grant={g} matchScore={g._score} explanation={g._explanation} highlightSector={sector === 'all' ? null : sector} />
          ))}
        </div>
      )}

      {filtered.length > visible && (
        <div style={{ textAlign: 'center' }}>
          <button className="btn" onClick={() => setVisible(v => v + 9)} style={{
            padding: '13px 32px', borderRadius: 999, border: 'none', background: 'var(--surface-container-high)',
            color: 'var(--on-surface)', fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
          }}>
            Load More Grants ⌄
          </button>
        </div>
      )}
      </>)}
    </div>
  )
}
