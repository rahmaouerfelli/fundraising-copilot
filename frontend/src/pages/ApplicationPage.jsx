import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { grantsApi, applicationsApi, errorMessage } from '../api/client'
import { useToast } from '../components/Toast'
import { useApp } from '../context/AppContext'
import PageHero from '../components/PageHero'

const SECTIONS = [
  { key: 'executive_summary', label: 'Executive Summary' },
  { key: 'objectives', label: 'Objectives' },
  { key: 'impact', label: 'Impact' },
  { key: 'activities', label: 'Activities' },
  { key: 'budget_justification', label: 'Budget Justification' },
  { key: 'indicators', label: 'Success Indicators' },
]

export default function ApplicationPage() {
  const { grantId } = useParams()
  const { activeNgo } = useApp()
  const [grant, setGrant] = useState(null)
  const [drafts, setDrafts] = useState({})
  const [drafting, setDrafting] = useState({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const toast = useToast()

  useEffect(() => {
    if (!grantId) return
    grantsApi.get(Number(grantId)).then(r => setGrant(r.data))
      .catch(err => toast.error('Could not load this grant', { description: errorMessage(err) }))
    if (activeNgo) {
      applicationsApi.get(activeNgo.id, Number(grantId))
        .then(r => {
          const app = r.data
          const loaded = {}
          SECTIONS.forEach(s => { if (app[s.key]) loaded[s.key] = app[s.key] })
          setDrafts(loaded)
        })
        .catch(() => {})
    }
  }, [grantId, activeNgo])

  const draftSection = async (sectionKey) => {
    if (!activeNgo || !grant) {
      toast.warning('Your NGO profile or this grant is missing')
      return
    }
    setDrafting(d => ({ ...d, [sectionKey]: true }))
    try {
      const res = await applicationsApi.draftSection(activeNgo.id, grant.id, sectionKey)
      const draft = res.data.draft || ''
      if (draft.startsWith('[AI draft')) {
        toast.warning('AI draft unavailable', { description: draft.replace(/^\[|\]$/g, '') })
      } else {
        setDrafts(d => ({ ...d, [sectionKey]: draft }))
        toast.success('Draft ready', { description: 'Review and adapt it before saving.', duration: 3000 })
      }
    } catch (err) {
      toast.error('Could not generate the draft', { description: errorMessage(err) })
    } finally {
      setDrafting(d => ({ ...d, [sectionKey]: false }))
    }
  }

  const handleSave = async () => {
    if (!activeNgo || !grant) return
    setSaving(true)
    try {
      await applicationsApi.save(activeNgo.id, grant.id, drafts)
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
      toast.success('Application draft saved')
    } catch (err) {
      toast.error('Could not save the draft', { description: errorMessage(err) })
    } finally {
      setSaving(false)
    }
  }

  if (!grant) return <div style={{ textAlign: 'center', padding: 80, color: '#94a3b8' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
      <PageHero
        icon="✍️" eyebrow={grant.funder_name} title={grant.title}
        subtitle="AI-assisted application drafting. Edit each section, then save."
        gradient={['#064e3b', '#059669']} glow="rgba(5,150,105,0.45)"
      />

      {SECTIONS.map(({ key, label }) => (
        <div key={key} className="glass-card card-hover" style={{ borderRadius: 22, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', background: 'rgba(255,255,255,0.5)', borderBottom: '1px solid rgba(114,119,131,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontWeight: 800, fontSize: 14, color: 'var(--on-surface)' }}>{label}</span>
            <button
              className="btn"
              onClick={() => draftSection(key)}
              disabled={drafting[key]}
              style={{
                padding: '7px 18px', borderRadius: 999, border: 'none',
                background: '#059669', color: '#fff', fontWeight: 700, fontSize: 12,
                cursor: drafting[key] ? 'not-allowed' : 'pointer', opacity: drafting[key] ? 0.7 : 1,
              }}
            >
              {drafting[key] ? 'Drafting…' : '✨ AI Draft'}
            </button>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <textarea
              value={drafts[key] || ''}
              onChange={e => setDrafts(d => ({ ...d, [key]: e.target.value }))}
              rows={5}
              placeholder={`Write your ${label.toLowerCase()} here, or click "AI Draft" to generate a starting point…`}
              style={{ width: '100%', border: '1.5px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', fontSize: 14, resize: 'vertical', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
        </div>
      ))}

      <button className="btn" onClick={handleSave} disabled={saving} style={{
        padding: '15px 28px', borderRadius: 999, border: 'none',
        background: 'var(--secondary)', color: 'var(--on-secondary)', fontWeight: 800, fontSize: 15, cursor: 'pointer',
        boxShadow: '0 8px 20px -8px rgba(220,159,13,0.5)',
      }}>
        {saving ? 'Saving…' : saved ? 'Saved!' : 'Save Application Draft'}
      </button>
    </div>
  )
}
