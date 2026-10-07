// Page numbers with ellipses: 1 … 4 5 [6] 7 8 … 20
function pageItems(page, pages) {
  const set = new Set([1, pages, page - 1, page, page + 1])
  if (page <= 3) [2, 3, 4].forEach(p => set.add(p))
  if (page >= pages - 2) [pages - 1, pages - 2, pages - 3].forEach(p => set.add(p))
  const nums = [...set].filter(p => p >= 1 && p <= pages).sort((a, b) => a - b)
  const items = []
  nums.forEach((p, i) => {
    if (i > 0 && p - nums[i - 1] > 1) items.push(`gap-${p}`)
    items.push(p)
  })
  return items
}

const base = {
  minWidth: 40, height: 40, padding: '0 12px', borderRadius: 999, border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: 13.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
}

export default function Pagination({ page, pages, onChange, disabled }) {
  if (pages <= 1) return null
  const go = (p) => { if (!disabled && p >= 1 && p <= pages && p !== page) onChange(p) }

  return (
    <nav aria-label="Pagination" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <button
        className="btn" onClick={() => go(page - 1)} disabled={page === 1 || disabled} aria-label="Previous page"
        style={{ ...base, background: 'var(--surface-container)', color: 'var(--on-surface)', opacity: page === 1 ? 0.4 : 1, cursor: page === 1 ? 'default' : 'pointer' }}
      >
        ← Prev
      </button>
      {pageItems(page, pages).map(item => typeof item === 'string' ? (
        <span key={item} aria-hidden style={{ color: 'var(--outline)', fontWeight: 700, padding: '0 4px' }}>…</span>
      ) : (
        <button
          key={item} className="btn" onClick={() => go(item)} disabled={disabled}
          aria-label={`Page ${item}`} aria-current={item === page ? 'page' : undefined}
          style={{
            ...base,
            background: item === page ? 'var(--primary)' : 'transparent',
            color: item === page ? '#fff' : 'var(--on-surface)',
            boxShadow: item === page ? '0 6px 16px -6px rgba(27,79,145,0.6)' : 'none',
          }}
        >
          {item}
        </button>
      ))}
      <button
        className="btn" onClick={() => go(page + 1)} disabled={page === pages || disabled} aria-label="Next page"
        style={{ ...base, background: 'var(--surface-container)', color: 'var(--on-surface)', opacity: page === pages ? 0.4 : 1, cursor: page === pages ? 'default' : 'pointer' }}
      >
        Next →
      </button>
    </nav>
  )
}
