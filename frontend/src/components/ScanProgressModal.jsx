import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const STEPS = [
  { phase: 'discovering', label: 'Searching the web for new calls', icon: '🔎' },
  { phase: 'fetching', label: 'Downloading grant pages', icon: '📥' },
  { phase: 'extracting', label: 'AI is reading the pages', icon: '🤖' },
  { phase: 'indexing', label: 'Indexing grants for matching', icon: '🗂️' },
]
const ORDER = ['starting', ...STEPS.map(s => s.phase), 'done']

// Overall progress (0–100) from the backend phase; the AI step is by far the longest.
export function scanPercent(p) {
  if (!p) return 0
  switch (p.phase) {
    case 'starting': return 2
    case 'discovering': return 8
    case 'fetching': return 18
    case 'extracting': return p.total ? 22 + Math.round(73 * (p.processed || 0) / p.total) : 22
    case 'indexing': return 97
    case 'done': return 100
    default: return 0
  }
}

function useElapsed(startedAt, running) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!running) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [running])
  if (!startedAt) return 0
  return Math.max(0, Math.round((now - new Date(startedAt).getTime()) / 1000))
}

const fmtDuration = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, '0')}s` : `${Math.round(s)}s`)

function ProgressRing({ percent, size = 128, stroke = 11 }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      {/* soft rotating halo */}
      <div aria-hidden className="spin-slow" style={{
        position: 'absolute', inset: -10, borderRadius: '50%',
        background: 'conic-gradient(from 0deg, rgba(27,79,145,0.0), rgba(27,79,145,0.18), rgba(220,159,13,0.22), rgba(27,79,145,0.0))',
        filter: 'blur(8px)',
      }} />
      <svg width={size} height={size} style={{ position: 'relative', transform: 'rotate(-90deg)' }} aria-hidden>
        <defs>
          <linearGradient id="scanGradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1b4f91" />
            <stop offset="100%" stopColor="#dc9f0d" />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-container-high)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#scanGradient)" strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)}
          style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.16, 1, 0.3, 1)' }}
        />
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <span className="display" style={{ fontSize: 34, fontWeight: 800, color: 'var(--primary)', lineHeight: 1 }}>{percent}%</span>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--outline)', marginTop: 4, letterSpacing: 0.4 }}>COMPLETE</span>
      </div>
    </div>
  )
}

function StepRow({ step, state, detail }) {
  const done = state === 'done'
  const active = state === 'active'
  return (
    <li style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 14,
      background: active ? 'rgba(27,79,145,0.07)' : 'transparent', transition: 'background 0.3s',
    }}>
      <span aria-hidden style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: done ? '#dcfce7' : active ? '#dbeafe' : 'var(--surface-container)',
        color: done ? '#15803d' : 'var(--primary)', fontSize: 13, fontWeight: 800,
      }}>
        {done ? <span className="check-pop">✓</span>
          : active ? <span className="spin" style={{ width: 14, height: 14, borderRadius: '50%', border: '2.5px solid #93c5fd', borderTopColor: 'var(--primary)', display: 'block' }} />
            : <span style={{ fontSize: 14, opacity: 0.6 }}>{step.icon}</span>}
      </span>
      <span style={{ flex: 1, fontSize: 14, fontWeight: active ? 700 : 600, color: state === 'pending' ? 'var(--outline)' : 'var(--on-surface)' }}>
        {step.label}
      </span>
      {detail && <span style={{ fontSize: 12.5, fontWeight: 700, color: active ? 'var(--primary)' : 'var(--outline)' }}>{detail}</span>}
    </li>
  )
}

function Stat({ value, label, accent }) {
  return (
    <div style={{ flex: 1, minWidth: 96, padding: '14px 10px', borderRadius: 18, background: 'var(--surface-container-low)', textAlign: 'center' }}>
      <div key={value} className="display count-up" style={{ fontSize: 26, fontWeight: 800, color: accent || 'var(--on-surface)', lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--on-surface-variant)', marginTop: 4 }}>{label}</div>
    </div>
  )
}

const btnPrimary = {
  padding: '13px 24px', borderRadius: 999, border: 'none', cursor: 'pointer', fontWeight: 800, fontSize: 14,
  background: 'var(--secondary)', color: 'var(--on-secondary)', boxShadow: '0 8px 20px -8px rgba(220,159,13,0.6)',
}
const btnSecondary = {
  padding: '13px 22px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 14,
  border: '1.5px solid var(--outline-variant)', background: 'transparent', color: 'var(--on-surface)',
}

/**
 * Centered scan dialog: live progress while running, then a summary with next actions.
 * `progress` is the payload of GET /grants/ingest/status.
 */
export default function ScanProgressModal({ progress, onMinimize, onClose, onViewMatches, onBrowseAll, onRetry }) {
  const running = !!progress?.running
  const failed = progress?.phase === 'failed'
  const result = !running && !failed ? progress?.last_result : null
  const elapsed = useElapsed(progress?.started_at, running)
  const primaryRef = useRef(null)

  useEffect(() => { primaryRef.current?.focus() }, [running, failed])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') (running ? onMinimize : onClose)() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [running, onMinimize, onClose])

  // Keep the page behind the dialog from scrolling.
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const percent = running ? scanPercent(progress) : 100
  const currentIdx = ORDER.indexOf(progress?.phase)
  const stepState = (phase) => {
    const idx = ORDER.indexOf(phase)
    if (!running || currentIdx > idx) return 'done'
    return currentIdx === idx ? 'active' : 'pending'
  }
  const stepDetail = (phase) => {
    if (!progress) return null
    if (phase === 'discovering' && stepState(phase) === 'done' && progress.discovered) return `${progress.discovered} new pages`
    if (phase === 'fetching' && progress.pages_due) {
      return stepState(phase) === 'done' ? `${progress.pages_fetched}/${progress.pages_due} read` : `${progress.pages_due} pages`
    }
    if (phase === 'extracting' && progress.total) return `${progress.processed || 0}/${progress.total}`
    return null
  }

  // Rendered in <body>: inside <main>, its fade-in transform would make position:fixed relative
  // to <main> (dialog off-centre) and trap it under the navbar's stacking context.
  return createPortal(
    <div
      className="modal-backdrop"
      onClick={running ? onMinimize : onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 900, background: 'rgba(15,23,42,0.42)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-labelledby="scan-title"
        className="modal-panel"
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(540px, 100%)', maxHeight: 'calc(100dvh - 32px)', overflowY: 'auto',
          background: '#fff', borderRadius: 32, padding: '28px 30px 24px',
          boxShadow: '0 40px 80px -20px rgba(15,23,42,0.45)', textAlign: 'center',
        }}
      >
        {running && (
          <>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <ProgressRing percent={percent} />
            </div>
            <h2 id="scan-title" style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800 }}>Scanning for grants…</h2>
            <p style={{ margin: '0 auto 16px', maxWidth: 400, color: 'var(--on-surface-variant)', fontSize: 14, lineHeight: 1.55 }}>
              This usually takes 1–2 minutes. You can keep working — the scan continues in the background.
            </p>

            <ol style={{ listStyle: 'none', margin: '0 0 16px', padding: 0, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {STEPS.map(step => (
                <StepRow key={step.phase} step={step} state={stepState(step.phase)} detail={stepDetail(step.phase)} />
              ))}
            </ol>

            <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <Stat value={progress.new_grants || 0} label="New grants" accent="#15803d" />
              <Stat value={progress.total ? `${progress.processed || 0}/${progress.total}` : '—'} label="Pages analysed" />
              <Stat value={fmtDuration(elapsed)} label="Elapsed" />
            </div>

            <button ref={primaryRef} className="btn" onClick={onMinimize} style={btnSecondary}>
              Continue in background
            </button>
          </>
        )}

        {failed && (
          <>
            <div className="check-pop" aria-hidden style={{
              width: 84, height: 84, margin: '0 auto 18px', borderRadius: '50%', background: '#fee2e2', color: 'var(--error)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 800,
            }}>!</div>
            <h2 id="scan-title" style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 800 }}>The scan could not finish</h2>
            <p style={{ margin: '0 auto 24px', maxWidth: 420, color: 'var(--on-surface-variant)', fontSize: 14, lineHeight: 1.55 }}>
              {progress.error || 'An unexpected error occurred.'} Grants found before the error have been kept.
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button ref={primaryRef} className="btn" onClick={onRetry} style={btnPrimary}>Try again</button>
              <button className="btn" onClick={onClose} style={btnSecondary}>Close</button>
            </div>
          </>
        )}

        {result && <ScanSummary result={result} primaryRef={primaryRef} onClose={onClose} onViewMatches={onViewMatches} onBrowseAll={onBrowseAll} />}
      </div>
    </div>,
    document.body,
  )
}

function ScanSummary({ result, primaryRef, onClose, onViewMatches, onBrowseAll }) {
  const found = result.total_new_grants
  const partial = !!result.stopped_reason
  const failedPages = (result.sources || []).filter(s => s.error).length
  const unchanged = (result.sources || []).filter(s => s.unchanged).length

  const tone = found > 0 && !partial ? 'success' : partial ? 'warning' : 'neutral'
  const badge = {
    success: { bg: '#dcfce7', color: '#15803d', icon: '✓' },
    warning: { bg: '#fef3c7', color: '#b45309', icon: '!' },
    neutral: { bg: '#dbeafe', color: '#1b4f91', icon: 'i' },
  }[tone]

  const title = found > 0
    ? `${found} new grant${found > 1 ? 's' : ''} found`
    : 'No new grants this time'
  const subtitle = found > 0
    ? 'They have been analysed and indexed. Open your AI matches to see which ones fit your NGO best.'
    : unchanged > 0
      ? 'The pages we know have not changed since the last scan, and no new open call was found. Try again in a day or two.'
      : 'The pages analysed did not contain open calls you are eligible for. Try again later — new calls are published every week.'

  return (
    <>
      <div className="check-pop" aria-hidden style={{
        width: 84, height: 84, margin: '0 auto 18px', borderRadius: '50%', background: badge.bg, color: badge.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 40, fontWeight: 800,
        boxShadow: `0 0 0 10px ${badge.bg}66`,
      }}>{badge.icon}</div>
      <h2 id="scan-title" style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 800 }}>{title}</h2>
      <p style={{ margin: '0 auto 22px', maxWidth: 430, color: 'var(--on-surface-variant)', fontSize: 14, lineHeight: 1.55 }}>{subtitle}</p>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <Stat value={found} label="New grants" accent={found > 0 ? '#15803d' : undefined} />
        <Stat value={result.sources_scanned} label="Pages scanned" />
        <Stat value={result.discovered_sources} label="New sources" />
        <Stat value={fmtDuration(result.duration_seconds)} label="Duration" />
      </div>

      {(partial || failedPages > 0) && (
        <div style={{
          textAlign: 'left', background: partial ? '#fffbeb' : 'var(--surface-container-low)', borderRadius: 16,
          padding: '12px 16px', marginBottom: 20, fontSize: 13, lineHeight: 1.5, color: 'var(--on-surface-variant)',
          border: partial ? '1px solid #fde68a' : 'none',
        }}>
          {partial && <div style={{ fontWeight: 700, color: '#92400e', marginBottom: failedPages ? 4 : 0 }}>⏸ {result.stopped_reason}</div>}
          {failedPages > 0 && <div>{failedPages} page{failedPages > 1 ? 's' : ''} could not be read (site unavailable or blocking automated access). They will be retried, then skipped if they keep failing.</div>}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        {found > 0 ? (
          <>
            <button ref={primaryRef} className="btn" onClick={onViewMatches} style={btnPrimary}>✨ See my AI matches</button>
            <button className="btn" onClick={onBrowseAll} style={btnSecondary}>Browse all grants</button>
          </>
        ) : (
          <>
            <button ref={primaryRef} className="btn" onClick={onBrowseAll} style={btnPrimary}>Browse existing grants</button>
            <button className="btn" onClick={onClose} style={btnSecondary}>Close</button>
          </>
        )}
      </div>
    </>
  )
}
