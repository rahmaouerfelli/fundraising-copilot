const STEPS = ['Account', 'Profile', 'Verify']

export default function StepIndicator({ current }) {
  const fillPct = ((current - 1) / (STEPS.length - 1)) * 100

  return (
    <div style={{ width: '100%', maxWidth: 560, margin: '0 auto 56px', position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <div style={{ position: 'absolute', left: 0, top: 20, width: '100%', height: 4, background: 'var(--surface-container-high)', borderRadius: 999, zIndex: 0 }} />
      <div style={{
        position: 'absolute', left: 0, top: 20, height: 4, borderRadius: 999, zIndex: 0,
        width: `${fillPct}%`, background: 'var(--tertiary)', transition: 'width 0.4s ease',
      }} />

      {STEPS.map((label, i) => {
        const n = i + 1
        const done = n < current
        const active = n === current
        return (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 1 }}>
            <div style={{
              width: 40, height: 40, borderRadius: '50%', fontWeight: 800, fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: done ? 'var(--primary)' : active ? 'var(--tertiary)' : 'var(--surface-container-highest)',
              color: done || active ? '#fff' : 'var(--outline)',
              boxShadow: done ? '0 8px 18px -6px rgba(27,79,145,0.4)' : active ? '0 0 0 4px var(--surface), 0 8px 18px -6px rgba(0,89,105,0.4)' : 'none',
              transition: 'background-color 0.3s ease',
            }}>
              {done ? '✓' : n}
            </div>
            <span style={{
              fontSize: 12, fontWeight: 700,
              color: done ? 'var(--primary)' : active ? 'var(--tertiary)' : 'var(--outline)',
            }}>
              {label}
            </span>
          </div>
        )
      })}
    </div>
  )
}
