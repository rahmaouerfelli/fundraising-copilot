import { useState, useEffect } from 'react'
import { pipelineApi, errorMessage } from '../api/client'
import { useToast } from '../components/Toast'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'
import PageHero from '../components/PageHero'

const STAGES = ['discovered', 'saved', 'preparing', 'submitted', 'won', 'lost']
const STAGE_COLOR = {
  discovered: '#64748b', saved: '#1d4ed8', preparing: '#7c3aed',
  submitted: '#0891b2', won: '#15803d', lost: '#dc2626',
}

export default function PipelinePage() {
  const { activeNgo } = useApp()
  const [entries, setEntries] = useState([])
  const [activeStage, setActiveStage] = useState(null)
  const navigate = useNavigate()
  const toast = useToast()

  const load = () => {
    if (!activeNgo) return
    pipelineApi.get(activeNgo.id, activeStage)
      .then(r => setEntries(r.data))
      .catch(err => toast.error('Could not load your pipeline', { description: errorMessage(err) }))
  }

  useEffect(() => { load() }, [activeNgo, activeStage])

  const moveStage = async (entryId, stage) => {
    try {
      await pipelineApi.update(entryId, { stage })
      if (stage === 'won') toast.success('Congratulations! Grant won 🎉', { icon: '🏆' })
      else toast.success(`Moved to "${stage}"`, { duration: 2500 })
      load()
    } catch (err) {
      toast.error('Could not update the stage', { description: errorMessage(err) })
    }
  }

  // Remove immediately, with an Undo action instead of a blocking confirm dialog.
  const remove = async (entry) => {
    try {
      await pipelineApi.remove(entry.id)
      load()
      toast.info('Removed from pipeline', {
        description: entry.grant?.title,
        duration: 7000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              const res = await pipelineApi.add(activeNgo.id, entry.grant_id, entry.stage)
              if (entry.notes) await pipelineApi.update(res.data.id, { notes: entry.notes })
              load()
            } catch (err) {
              toast.error('Could not restore the grant', { description: errorMessage(err) })
            }
          },
        },
      })
    } catch (err) {
      toast.error('Could not remove this grant', { description: errorMessage(err) })
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHero
        icon="📋" eyebrow="Pipeline" title="Grant Pipeline"
        subtitle="Track every grant from discovery to outcome."
        gradient={['#4c1d95', '#7c3aed']} glow="rgba(124,58,237,0.45)"
      />

      {/* Stage filter */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn" onClick={() => setActiveStage(null)} style={{
          padding: '7px 16px', borderRadius: 999, fontWeight: 700, fontSize: 13,
          border: `1.5px solid ${!activeStage ? '#7c3aed' : 'var(--outline-variant)'}`,
          background: !activeStage ? '#f5f3ff' : 'transparent', color: !activeStage ? '#7c3aed' : 'var(--on-surface-variant)', cursor: 'pointer',
        }}>All</button>
        {STAGES.map(s => (
          <button key={s} className="btn" onClick={() => setActiveStage(s)} style={{
            padding: '7px 16px', borderRadius: 999, fontWeight: 700, fontSize: 13, textTransform: 'capitalize',
            border: `1.5px solid ${activeStage === s ? STAGE_COLOR[s] : 'var(--outline-variant)'}`,
            background: activeStage === s ? '#f8fafc' : 'transparent',
            color: activeStage === s ? STAGE_COLOR[s] : 'var(--on-surface-variant)', cursor: 'pointer',
          }}>{s}</button>
        ))}
      </div>

      {/* Entries */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {entries.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
            No grants in pipeline yet. Save grants from the Discovery page.
          </div>
        )}
        {entries.map(entry => (
          <div key={entry.id} className="glass-card card-hover" style={{ borderRadius: 22, padding: 22, display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, textTransform: 'uppercase',
                  background: `${STAGE_COLOR[entry.stage]}18`, color: STAGE_COLOR[entry.stage],
                }}>{entry.stage}</span>
                {entry.match_score && (
                  <span style={{ fontSize: 12, color: '#64748b' }}>Match: {entry.match_score}%</span>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', marginBottom: 4 }}>
                {entry.grant?.title}
              </div>
              <div style={{ fontSize: 13, color: '#64748b' }}>{entry.grant?.funder_name}</div>
              {entry.grant?.deadline && (
                <div style={{ fontSize: 12, color: '#f59e0b', marginTop: 4, fontWeight: 600 }}>
                  Deadline: {new Date(entry.grant.deadline).toLocaleDateString()}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
              <select
                value={entry.stage}
                onChange={e => moveStage(entry.id, e.target.value)}
                style={{ border: '1.5px solid #d1d5db', borderRadius: 8, padding: '6px 10px', fontSize: 13, cursor: 'pointer' }}
              >
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="btn" onClick={() => navigate(`/apply/${entry.grant_id}`)} style={{
                padding: '6px 14px', borderRadius: 8, border: '1.5px solid #7c3aed',
                background: '#f5f3ff', color: '#7c3aed', fontWeight: 600, fontSize: 12, cursor: 'pointer',
              }}>Draft</button>
              <button className="btn" onClick={() => remove(entry)} style={{
                padding: '6px 14px', borderRadius: 8, border: '1.5px solid #fee2e2',
                background: '#fff', color: '#ef4444', fontWeight: 600, fontSize: 12, cursor: 'pointer',
              }}>Remove</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
