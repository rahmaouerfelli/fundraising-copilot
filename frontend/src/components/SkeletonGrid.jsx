// Placeholder cards shown while grants are loading.
export default function SkeletonGrid({ count = 6 }) {
  return (
    <div className="grant-grid" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="glass-card" style={{ borderRadius: 28, padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="skeleton" style={{ width: '40%', height: 14 }} />
          <div className="skeleton" style={{ width: '90%', height: 20 }} />
          <div className="skeleton" style={{ width: '70%', height: 20 }} />
          <div className="skeleton" style={{ width: '100%', height: 54, marginTop: 6 }} />
          <div className="skeleton" style={{ width: '50%', height: 34, borderRadius: 999, marginTop: 'auto' }} />
        </div>
      ))}
    </div>
  )
}
