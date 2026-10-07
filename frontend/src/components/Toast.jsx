import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(null)

const VARIANTS = {
  success: { icon: '✓', color: '#15803d', bg: '#dcfce7' },
  error: { icon: '!', color: '#ba1a1a', bg: '#fee2e2' },
  warning: { icon: '!', color: '#b45309', bg: '#fef3c7' },
  info: { icon: 'i', color: '#1b4f91', bg: '#dbeafe' },
}

const DEFAULT_DURATION = { success: 4500, info: 5000, warning: 7000, error: 8000 }
let nextId = 1

function ToastItem({ toast, onClose }) {
  const v = VARIANTS[toast.type]
  const [paused, setPaused] = useState(false)

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={toast.leaving ? 'toast toast-leave' : 'toast toast-enter'}
      onMouseEnter={() => { setPaused(true); toast.pause() }}
      onMouseLeave={() => { setPaused(false); toast.resume() }}
      style={{
        position: 'relative', overflow: 'hidden', width: 'min(380px, calc(100vw - 32px))',
        background: 'rgba(255,255,255,0.96)', backdropFilter: 'blur(12px)',
        borderRadius: 18, boxShadow: '0 18px 40px -12px rgba(15,23,42,0.28), 0 2px 6px rgba(15,23,42,0.06)',
        border: '1px solid rgba(15,23,42,0.06)', borderLeft: `4px solid ${v.color}`,
        padding: '14px 14px 16px 14px', display: 'flex', gap: 12, alignItems: 'flex-start',
      }}
    >
      <div aria-hidden style={{
        flexShrink: 0, width: 30, height: 30, borderRadius: '50%', background: v.bg, color: v.color,
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 15,
      }}>
        {toast.icon || v.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--on-surface)', lineHeight: 1.35 }}>{toast.title}</div>
        {toast.description && (
          <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 3, lineHeight: 1.45, whiteSpace: 'pre-line' }}>
            {toast.description}
          </div>
        )}
        {toast.action && (
          <button
            className="btn"
            onClick={() => { toast.action.onClick(); onClose() }}
            style={{
              marginTop: 10, padding: '6px 14px', borderRadius: 999, border: `1.5px solid ${v.color}`,
              background: 'transparent', color: v.color, fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        onClick={onClose}
        aria-label="Dismiss notification"
        style={{
          flexShrink: 0, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--outline)',
          fontSize: 18, lineHeight: 1, padding: 4, borderRadius: 8,
        }}
      >
        ×
      </button>
      {toast.duration > 0 && (
        <div aria-hidden style={{
          position: 'absolute', left: 0, bottom: 0, height: 3, width: '100%', background: v.color, opacity: 0.35,
          transformOrigin: 'left', animation: `toastTimer ${toast.duration}ms linear forwards`,
          animationPlayState: paused ? 'paused' : 'running',
        }} />
      )}
    </div>
  )
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const remove = useCallback((id) => {
    clearTimeout(timers.current[id]?.handle)
    delete timers.current[id]
    setToasts(ts => ts.map(t => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 220)
  }, [])

  const schedule = useCallback((id, ms) => {
    timers.current[id] = { handle: setTimeout(() => remove(id), ms), started: Date.now(), remaining: ms }
  }, [remove])

  const show = useCallback((type, title, opts = {}) => {
    const id = nextId++
    const duration = opts.duration ?? DEFAULT_DURATION[type]
    const toast = {
      id, type, title, duration,
      description: opts.description, action: opts.action, icon: opts.icon,
      pause: () => {
        const t = timers.current[id]
        if (!t) return
        clearTimeout(t.handle)
        t.remaining -= Date.now() - t.started
      },
      resume: () => {
        const t = timers.current[id]
        if (t) schedule(id, Math.max(t.remaining, 800))
      },
    }
    setToasts(ts => [...ts.slice(-3), toast])  // keep at most 4 on screen
    if (duration > 0) schedule(id, duration)
    return id
  }, [schedule])

  const api = useMemo(() => ({
    success: (title, opts) => show('success', title, opts),
    error: (title, opts) => show('error', title, opts),
    warning: (title, opts) => show('warning', title, opts),
    info: (title, opts) => show('info', title, opts),
    dismiss: remove,
  }), [show, remove])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        style={{
          position: 'fixed', top: 96, right: 16, zIndex: 1000,
          display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-end', pointerEvents: 'none',
        }}
      >
        {toasts.map(t => (
          <div key={t.id} style={{ pointerEvents: 'auto' }}>
            <ToastItem toast={t} onClose={() => remove(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used within ToastProvider')
  return ctx
}
