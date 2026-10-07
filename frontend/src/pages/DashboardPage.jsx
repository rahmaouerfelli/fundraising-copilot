import { useState, useEffect } from 'react'
import { dashboardApi } from '../api/client'
import { useApp } from '../context/AppContext'
import PageHero from '../components/PageHero'

const KPI_CONFIG = [
  { key: 'grants_in_db', label: 'Grants in DB', color: '#1d4ed8' },
  { key: 'grants_saved', label: 'Saved', color: '#7c3aed' },
  { key: 'grants_preparing', label: 'Preparing', color: '#0891b2' },
  { key: 'grants_submitted', label: 'Submitted', color: '#f59e0b' },
  { key: 'grants_won', label: 'Won', color: '#15803d' },
  { key: 'success_rate_pct', label: 'Success Rate %', color: '#059669' },
]

export default function DashboardPage() {
  const { activeNgo } = useApp()
  const [data, setData] = useState(null)

  useEffect(() => {
    if (!activeNgo) return
    dashboardApi.get(activeNgo.id).then(r => setData(r.data)).catch(console.error)
  }, [activeNgo])

  if (!activeNgo) return (
    <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>
      Set up your NGO profile to see your dashboard.
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHero
        icon="📊" eyebrow="Overview" title="Dashboard"
        subtitle={activeNgo.name}
        gradient={['#0c4a6e', '#0369a1']} glow="rgba(3,105,161,0.45)"
      />

      {!data ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>Loading…</div>
      ) : (
        <>
          {/* KPI grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            {KPI_CONFIG.map(({ key, label, color }) => (
              <div key={key} className="glass-card card-hover" style={{ borderRadius: 20, padding: '20px 24px', borderTop: `4px solid ${color}` }}>
                <div style={{ fontSize: 13, color: '#64748b', fontWeight: 600, marginBottom: 8 }}>{label}</div>
                <div style={{ fontSize: 32, fontWeight: 900, color }}>{data.kpis[key] ?? 0}</div>
              </div>
            ))}
          </div>

          {/* Upcoming deadlines */}
          <div className="glass-card" style={{ borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: '14px 22px', background: '#fffbeb', borderBottom: '1px solid #fde68a', fontWeight: 800, fontSize: 14, color: '#92400e' }}>
              Upcoming Deadlines (30 days)
            </div>
            <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {data.upcoming_deadlines.length === 0 ? (
                <div style={{ color: '#94a3b8', fontSize: 14 }}>No upcoming deadlines.</div>
              ) : data.upcoming_deadlines.map(d => (
                <div key={d.pipeline_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>{d.grant_title}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, textTransform: 'capitalize' }}>Stage: {d.stage}</div>
                  </div>
                  <div style={{ fontWeight: 700, color: '#f59e0b', fontSize: 13 }}>
                    {d.deadline ? new Date(d.deadline).toLocaleDateString() : 'No deadline'}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Recent grants */}
          <div className="glass-card" style={{ borderRadius: 24, overflow: 'hidden' }}>
            <div style={{ padding: '14px 22px', background: '#f0f9ff', borderBottom: '1px solid #bae6fd', fontWeight: 800, fontSize: 14, color: '#075985' }}>
              Recently Added Grants
            </div>
            <div style={{ padding: '16px 22px', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {data.recent_grants.map(g => (
                <div key={g.id} style={{ fontSize: 14, color: '#334155', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontWeight: 700 }}>{g.title}</span>
                  <span style={{ color: '#94a3b8', marginLeft: 8 }}>— {g.funder_name}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
