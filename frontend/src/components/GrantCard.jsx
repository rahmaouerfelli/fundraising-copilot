import { useState } from 'react'
import { pipelineApi, matchesApi, errorMessage } from '../api/client'
import { useToast } from './Toast'
import { useApp } from '../context/AppContext'
import { useNavigate } from 'react-router-dom'

function deadlineInfo(grant) {
  if (!grant.deadline) return { color: '#94a3b8', bg: '#f1f5f9', label: 'No deadline' }
  const days = Math.ceil((new Date(grant.deadline) - Date.now()) / 86400000)
  if (days < 0) return { color: '#64748b', bg: '#f1f5f9', label: 'Closed' }
  if (days === 0) return { color: '#dc2626', bg: '#fef2f2', label: 'Closes today' }
  if (days === 1) return { color: '#dc2626', bg: '#fef2f2', label: 'Closes tomorrow' }
  if (days < 14) return { color: '#dc2626', bg: '#fef2f2', label: `Closes in ${days}d` }
  if (days < 30) return { color: '#b45309', bg: '#fffbeb', label: `Closes in ${days}d` }
  return { color: '#15803d', bg: '#f0fdf4', label: `Closes in ${days}d` }
}

function ScoreRing({ score }) {
  const ringColor = score >= 70 ? '#16a34a' : score >= 40 ? '#d97706' : '#dc2626'
  return (
    <div style={{
      flexShrink: 0, position: 'relative', width: 48, height: 48, borderRadius: '50%',
      background: `conic-gradient(${ringColor} ${score * 3.6}deg, rgba(255,255,255,0.35) 0deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontWeight: 900, fontSize: 11.5, color: ringColor }}>{score}%</span>
      </div>
    </div>
  )
}

function BookmarkButton({ saved, onClick, dark }) {
  return (
    <button
      className="btn"
      onClick={onClick}
      title={saved ? 'Saved to pipeline' : 'Save to pipeline'}
      style={{
        width: 38, height: 38, borderRadius: '50%', border: dark ? 'none' : '1px solid var(--outline-variant)',
        background: saved ? 'var(--primary)' : dark ? 'rgba(255,255,255,0.85)' : '#fff',
        color: saved ? '#fff' : dark ? 'var(--on-surface)' : 'var(--outline)',
        cursor: 'pointer', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, boxShadow: dark ? '0 2px 8px rgba(0,0,0,0.15)' : 'none',
      }}
    >
      🔖
    </button>
  )
}

// Descriptions come from an LLM and occasionally contain markdown.
const plain = (text) => (text || '').replace(/\*\*|__|`/g, '').replace(/^#+\s*/gm, '')

const MAX_BADGES = 2

export default function GrantCard({ grant, matchScore, explanation, highlightSector }) {
  const { activeNgo } = useApp()
  const navigate = useNavigate()
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)
  const toast = useToast()

  const handleSave = async () => {
    if (!activeNgo) {
      toast.warning('Set up your NGO profile first', {
        action: { label: 'Complete profile', onClick: () => navigate('/onboarding') },
      })
      return
    }
    if (saved || saving) return
    setSaving(true)
    try {
      await pipelineApi.add(activeNgo.id, grant.id, 'saved')
      matchesApi.recordInteraction(activeNgo.id, grant.id, 'saved').catch(() => {})
      setSaved(true)
      toast.success('Saved to your pipeline', {
        description: grant.title,
        action: { label: 'Open pipeline', onClick: () => navigate('/pipeline') },
      })
    } catch (err) {
      toast.error('Could not save this grant', { description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  const dl = deadlineInfo(grant)
  // The filtered sector first, so the card visibly matches the active filter.
  const allSectors = grant.sectors || []
  const orderedSectors = highlightSector && allSectors.includes(highlightSector)
    ? [highlightSector, ...allSectors.filter(s => s !== highlightSector)]
    : allSectors
  const badges = orderedSectors.slice(0, MAX_BADGES)
  const extraSectors = orderedSectors.slice(MAX_BADGES)
  const amountLabel = grant.amount_max
    ? `Up to ${grant.currency || 'USD'} ${grant.amount_max.toLocaleString()}`
    : grant.amount_min ? `From ${grant.currency || 'USD'} ${grant.amount_min.toLocaleString()}` : null

  return (
    <article className="glass-card card-hover" style={{ borderRadius: 28, padding: 24, display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, minWidth: 0 }}>
          {badges.map(s => (
            <span key={s} style={{
              fontSize: 12, fontWeight: 700, padding: '5px 12px', borderRadius: 999, whiteSpace: 'nowrap',
              background: s === highlightSector ? 'rgba(27,79,145,0.12)' : 'var(--surface-container)',
              color: s === highlightSector ? 'var(--primary)' : 'var(--on-surface)',
            }}>
              {s}
            </span>
          ))}
          {extraSectors.length > 0 && (
            <span title={extraSectors.join(', ')} style={{ fontSize: 12, fontWeight: 700, padding: '5px 10px', borderRadius: 999, background: 'var(--surface-container)', color: 'var(--outline)' }}>
              +{extraSectors.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {matchScore != null && <ScoreRing score={matchScore} />}
          <BookmarkButton saved={saved} onClick={handleSave} />
        </div>
      </div>

      <div>
        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
          {grant.funder_name}
        </div>
        <h3 style={{ fontSize: 16.5, fontWeight: 800, color: 'var(--on-surface)', margin: 0, lineHeight: 1.35 }}>
          {grant.title}
        </h3>
      </div>

      <p className="line-clamp-3" style={{ fontSize: 13, color: 'var(--on-surface-variant)', lineHeight: 1.6, margin: 0, flexGrow: 1 }}>
        {plain(grant.description)}
      </p>

      {explanation && (
        <div style={{
          background: 'linear-gradient(135deg, #eff6ff, #f5f3ff)', borderRadius: 12,
          padding: '9px 12px', fontSize: 12, color: '#3730a3', lineHeight: 1.55,
          display: 'flex', gap: 7, border: '1px solid #e0e7ff',
        }}>
          <span style={{ flexShrink: 0 }}>✨</span>{plain(explanation)}
        </div>
      )}

      <span style={{ alignSelf: 'flex-start', background: dl.bg, borderRadius: 20, padding: '5px 12px', color: dl.color, fontWeight: 700, fontSize: 12 }}>
        ⏳ {grant.deadline ? `${new Date(grant.deadline).toLocaleDateString()} · ${dl.label}` : 'No deadline'}
      </span>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTop: '1px solid var(--outline-variant)' }}>
        <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--on-surface)' }}>{amountLabel || '—'}</span>
        <div style={{ display: 'flex', gap: 12 }}>
          {grant.source_url && (
            <a className="btn" href={grant.source_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--on-surface-variant)', fontWeight: 600, fontSize: 12.5, textDecoration: 'none' }}>
              View ↗
            </a>
          )}
          <a className="btn" onClick={() => navigate(`/apply/${grant.id}`)} style={{ color: 'var(--primary)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer' }}>
            Apply
          </a>
        </div>
      </div>
    </article>
  )
}
