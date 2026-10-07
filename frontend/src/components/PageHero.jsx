export default function PageHero({ icon, eyebrow, title, subtitle, gradient, glow, children }) {
  const bg = `linear-gradient(135deg, ${gradient.join(', ')})`

  return (
    <div className="pop-in" style={{
      position: 'relative',
      overflow: 'hidden',
      background: bg,
      borderRadius: 24,
      padding: '34px 38px',
      color: '#fff',
      boxShadow: `0 22px 50px -20px ${glow}`,
    }}>
      <div style={{
        position: 'absolute', top: -70, right: -30, width: 220, height: 220, borderRadius: '50%',
        background: 'rgba(255,255,255,0.10)', animation: 'floatSlow 9s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', bottom: -90, left: '30%', width: 200, height: 200, borderRadius: '50%',
        background: 'rgba(255,255,255,0.06)', animation: 'floatSlower 11s ease-in-out infinite',
      }} />
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(115deg, rgba(255,255,255,0.14) 0%, transparent 30%)',
      }} />

      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
        <div>
          {eyebrow && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 7,
              fontSize: 11.5, fontWeight: 800, letterSpacing: 1.2, textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.75)', marginBottom: 10,
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#fff', boxShadow: '0 0 0 3px rgba(255,255,255,0.25)' }} />
              {eyebrow}
            </div>
          )}
          <h1 className="display" style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', letterSpacing: -0.4, display: 'flex', alignItems: 'center', gap: 12 }}>
            {icon && <span style={{ fontSize: 26 }}>{icon}</span>}
            {title}
          </h1>
          {subtitle && (
            <p style={{ color: 'rgba(255,255,255,0.85)', margin: 0, fontSize: 14.5, maxWidth: 560, lineHeight: 1.55 }}>
              {subtitle}
            </p>
          )}
        </div>
        {children && (
          <div style={{ flexShrink: 0 }}>{children}</div>
        )}
      </div>
    </div>
  )
}
