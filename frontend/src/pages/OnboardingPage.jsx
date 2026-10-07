import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ngosApi, errorMessage } from '../api/client'
import { useApp } from '../context/AppContext'
import PageHero from '../components/PageHero'
import StepIndicator from '../components/StepIndicator'
import { useSignupValidation } from '../hooks/useSignupValidation'
import { SECTORS } from '../constants/sectors'

const inputStyle = {
  width: '100%', background: 'var(--surface-container-low)', border: '1.5px solid transparent',
  borderRadius: 24, padding: '14px 22px', fontSize: 15, color: 'var(--on-surface)',
  outline: 'none', boxSizing: 'border-box', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
}
const labelStyle = { fontSize: 13.5, fontWeight: 700, color: 'var(--on-surface)', display: 'block', marginBottom: 8 }
const SUCCESS = '#15803d'
const STRENGTH = [
  { label: '', color: 'transparent' },
  { label: 'Weak', color: '#dc2626' },
  { label: 'Fair', color: '#d97706' },
  { label: 'Good', color: '#65a30d' },
  { label: 'Strong', color: SUCCESS },
]

// Border colour reflects live validation once the user has interacted with the field.
const validatedInput = (state, show) => ({
  ...inputStyle,
  borderColor: !show ? 'transparent' : state.error ? 'var(--error)' : state.ok ? SUCCESS : 'transparent',
})

function FieldMessage({ show, state, okText }) {
  if (!show) return null
  if (state.error) return <div role="alert" style={{ color: 'var(--error)', fontSize: 12.5, fontWeight: 600, marginTop: 6, paddingLeft: 8 }}>{state.error}</div>
  if (state.ok && okText) return <div style={{ color: SUCCESS, fontSize: 12.5, fontWeight: 600, marginTop: 6, paddingLeft: 8 }}>✓ {okText}</div>
  return null
}

export default function OnboardingPage() {
  const { user, activeNgo, loading, register, login, linkNgo } = useApp()
  const navigate = useNavigate()
  const initRef = useRef(false)

  const [step, setStep] = useState(user && activeNgo ? 3 : user ? 2 : 1)

  useEffect(() => {
    if (initRef.current || loading) return
    initRef.current = true
    if (user && activeNgo) setStep(3)
    else if (user) setStep(2)
  }, [loading, user, activeNgo])

  // --- Step 1: Account ---
  const [authMode, setAuthMode] = useState('register')
  const [accountForm, setAccountForm] = useState({ email: '', password: '', confirmPassword: '', fullName: '' })
  const [accountError, setAccountError] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [touched, setTouched] = useState({})
  const validation = useSignupValidation(accountForm, authMode)
  const { fields } = validation
  const shown = (name) => touched[name] || touched._submit
  const touch = (name) => setTouched(t => ({ ...t, [name]: true }))
  const updateAccount = (name, value) => {
    setAccountForm(f => ({ ...f, [name]: value }))
    if (value) touch(name)  // validate as the user types
  }

  const submitAccount = async (e) => {
    e.preventDefault()
    setAccountError('')
    setTouched(t => ({ ...t, _submit: true }))
    if (!validation.canSubmit) return
    setAccountSaving(true)
    try {
      if (authMode === 'register') {
        await register(accountForm.email, accountForm.password, accountForm.fullName)
      } else {
        const loggedIn = await login(accountForm.email, accountForm.password)
        if (loggedIn.ngo) {
          navigate('/discovery')  // profile already set up: nothing left to do here
          return
        }
      }
      setStep(2)
    } catch (err) {
      setAccountError(errorMessage(err))
    } finally {
      setAccountSaving(false)
    }
  }

  // --- Step 2: Profile ---
  const [form, setForm] = useState(activeNgo || {
    name: '', mission: '', country: 'Tunisia',
    sectors: [], beneficiaries: '', annual_budget: '',
    funding_needs: '', preferred_grant_size_min: '',
    preferred_grant_size_max: '', keywords: '', website: '',
  })
  const [logoPreview, setLogoPreview] = useState(null)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState('')

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const toggleSector = (s) => set('sectors', form.sectors.includes(s)
    ? form.sectors.filter(x => x !== s) : [...form.sectors, s])

  const handleLogoChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setLogoPreview(reader.result)
    reader.readAsDataURL(file)
  }

  const submitProfile = async (e) => {
    e.preventDefault()
    setProfileError('')
    setProfileSaving(true)
    try {
      const payload = {
        ...form,
        annual_budget: form.annual_budget ? Number(form.annual_budget) : null,
        preferred_grant_size_min: form.preferred_grant_size_min ? Number(form.preferred_grant_size_min) : null,
        preferred_grant_size_max: form.preferred_grant_size_max ? Number(form.preferred_grant_size_max) : null,
        keywords: typeof form.keywords === 'string'
          ? form.keywords.split(',').map(k => k.trim()).filter(Boolean)
          : form.keywords,
      }
      const res = activeNgo?.id
        ? await ngosApi.update(activeNgo.id, payload)
        : await ngosApi.create(payload)
      await linkNgo(res.data.id)
      setStep(3)
    } catch (err) {
      setProfileError(errorMessage(err, 'Could not save your NGO profile. Please try again.'))
    } finally {
      setProfileSaving(false)
    }
  }

  const field = (label, key, type = 'text', placeholder = '') => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={form[key] || ''}
        onChange={e => set(key, e.target.value)}
        placeholder={placeholder}
        style={inputStyle}
      />
    </div>
  )

  return (
    <div style={{ maxWidth: 760, margin: '0 auto' }} className="fade-in">
      <div style={{ marginBottom: 28 }}>
        <PageHero
          icon="🏷️" eyebrow="Setup" title="Tell us about your mission"
          subtitle="Complete your account and NGO profile so the AI can personalise grant recommendations for your organisation."
          gradient={['#1e3a8a', '#1d4ed8']} glow="rgba(29,78,216,0.45)"
        />
      </div>

      <StepIndicator current={step} />

      {/* ---------- Step 1: Account ---------- */}
      {step === 1 && (
        <form onSubmit={submitAccount} className="glass-card pop-in" style={{ borderRadius: 32, padding: '40px 44px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ display: 'flex', gap: 8, background: 'var(--surface-container-low)', borderRadius: 999, padding: 4, width: 'fit-content' }}>
            {[['register', 'Create Account'], ['login', 'Log in']].map(([m, label]) => (
              <button key={m} type="button" className="btn" onClick={() => { setAuthMode(m); setAccountError(''); setTouched({}) }} style={{
                padding: '8px 18px', borderRadius: 999, border: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: 700,
                background: authMode === m ? '#fff' : 'transparent',
                color: authMode === m ? 'var(--primary)' : 'var(--on-surface-variant)',
                boxShadow: authMode === m ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              }}>
                {label}
              </button>
            ))}
          </div>

          {authMode === 'register' && (
            <div>
              <label style={labelStyle}>Full Name</label>
              <input type="text" value={accountForm.fullName} onChange={e => updateAccount('fullName', e.target.value)}
                onBlur={() => touch('fullName')} autoComplete="name"
                placeholder="Your name" style={validatedInput(fields.fullName, shown('fullName'))} />
              <FieldMessage show={shown('fullName')} state={fields.fullName} />
            </div>
          )}
          <div>
            <label style={labelStyle}>Email</label>
            <input type="email" value={accountForm.email} onChange={e => updateAccount('email', e.target.value)}
              onBlur={() => touch('email')} autoComplete="email" aria-invalid={shown('email') && !!fields.email.error}
              placeholder="you@organisation.org" style={validatedInput(fields.email, shown('email'))} />
            {authMode === 'register' && validation.emailStatus === 'checking' && shown('email') && (
              <div style={{ color: 'var(--on-surface-variant)', fontSize: 12.5, marginTop: 6, paddingLeft: 8 }}>Checking availability…</div>
            )}
            <FieldMessage show={shown('email')} state={fields.email} okText={authMode === 'register' ? 'Email available' : null} />
          </div>
          <div>
            <label style={labelStyle}>Password</label>
            <input type="password" value={accountForm.password} onChange={e => updateAccount('password', e.target.value)}
              onBlur={() => touch('password')} autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
              placeholder={authMode === 'register' ? 'At least 8 characters, a letter and a number' : 'Your password'}
              style={validatedInput(fields.password, shown('password'))} />
            {authMode === 'register' && accountForm.password && (
              <div style={{ marginTop: 10, paddingLeft: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ flex: 1, display: 'flex', gap: 4 }}>
                    {[1, 2, 3, 4].map(i => (
                      <div key={i} style={{
                        flex: 1, height: 5, borderRadius: 999,
                        background: i <= validation.strength ? STRENGTH[validation.strength].color : 'var(--surface-container-high)',
                        transition: 'background 0.2s',
                      }} />
                    ))}
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 700, color: STRENGTH[validation.strength].color, minWidth: 48 }}>
                    {STRENGTH[validation.strength].label}
                  </span>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 4 }}>
                  {validation.rules.map(r => (
                    <li key={r.label} style={{ fontSize: 12.5, fontWeight: 600, color: r.ok ? SUCCESS : 'var(--on-surface-variant)' }}>
                      {r.ok ? '✓' : '○'} {r.label}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {(authMode === 'login' || !accountForm.password) && <FieldMessage show={shown('password')} state={fields.password} />}
          </div>
          {authMode === 'register' && (
            <div>
              <label style={labelStyle}>Confirm Password</label>
              <input type="password" value={accountForm.confirmPassword} onChange={e => updateAccount('confirmPassword', e.target.value)}
                onBlur={() => touch('confirmPassword')} autoComplete="new-password"
                placeholder="Repeat your password" style={validatedInput(fields.confirmPassword, shown('confirmPassword'))} />
              <FieldMessage show={shown('confirmPassword')} state={fields.confirmPassword} okText="Passwords match" />
            </div>
          )}

          {accountError && (
            <div style={{ background: '#fef2f2', color: 'var(--error)', borderRadius: 16, padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>
              {accountError}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button type="submit" className="btn" disabled={accountSaving || (touched._submit && !validation.canSubmit)} style={{
              padding: '14px 32px', borderRadius: 999, border: 'none',
              background: 'var(--secondary)', color: 'var(--on-secondary)',
              fontWeight: 800, fontSize: 14.5, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(220,159,13,0.4)', display: 'flex', alignItems: 'center', gap: 10,
              opacity: accountSaving || !validation.canSubmit ? 0.6 : 1,
            }}>
              {accountSaving ? 'Please wait…' : authMode === 'register' ? 'Create Account' : 'Log In'} →
            </button>
          </div>
        </form>
      )}

      {/* ---------- Step 2: Profile ---------- */}
      {step === 2 && (
        <form onSubmit={submitProfile} className="glass-card pop-in" style={{ borderRadius: 32, padding: '40px 44px', display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <label style={{
              width: 128, height: 128, borderRadius: '50%', border: '2px dashed var(--primary-fixed-dim)',
              background: logoPreview ? `center/cover no-repeat url(${logoPreview})` : 'var(--surface-container-low)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', position: 'relative', overflow: 'hidden',
            }}>
              {!logoPreview && (
                <>
                  <span style={{ fontSize: 30, color: 'var(--primary)', marginBottom: 4 }}>⬆</span>
                  <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--primary)' }}>Upload Logo</span>
                </>
              )}
              <input type="file" accept="image/*" onChange={handleLogoChange} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
            </label>
          </div>

          {field('NGO Name *', 'name', 'text', "Enter your organization's legal name")}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Mission Description *</label>
            <textarea
              value={form.mission || ''}
              onChange={e => set('mission', e.target.value)}
              rows={3}
              placeholder="Briefly describe your organization's core mission and vision..."
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={labelStyle}>Focus Areas (select as many as apply)</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              {SECTORS.map(s => {
                const active = form.sectors?.includes(s)
                return (
                  <button key={s} type="button" className="btn" onClick={() => toggleSector(s)} style={{
                    padding: '8px 18px', borderRadius: 999,
                    border: active ? 'none' : '1px solid var(--outline-variant)',
                    background: active ? 'var(--secondary-container)' : 'transparent',
                    color: active ? 'var(--on-secondary-container)' : 'var(--on-surface-variant)',
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    boxShadow: active ? '0 2px 8px rgba(0,0,0,0.1)' : 'none',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}>
                    {s}{active && ' ✕'}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {field('Country', 'country', 'text', 'Tunisia')}
            {field('Website', 'website', 'url', 'https://...')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Beneficiaries</label>
            <textarea value={form.beneficiaries || ''} onChange={e => set('beneficiaries', e.target.value)} rows={2}
              placeholder="Who does your NGO serve?" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {field('Keywords (comma-separated)', 'keywords', 'text', 'inclusion, special needs, Tunisia, ...')}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20 }}>
            {field('Annual Budget (USD)', 'annual_budget', 'number', '50000')}
            {field('Min. Grant Size (USD)', 'preferred_grant_size_min', 'number', '5000')}
            {field('Max. Grant Size (USD)', 'preferred_grant_size_max', 'number', '100000')}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={labelStyle}>Funding Needs</label>
            <textarea value={form.funding_needs || ''} onChange={e => set('funding_needs', e.target.value)} rows={2}
              placeholder="What do you need funding for?" style={{ ...inputStyle, resize: 'vertical' }} />
          </div>

          {profileError && (
            <div style={{ background: '#fef2f2', color: 'var(--error)', borderRadius: 16, padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>
              {profileError}
            </div>
          )}

          <div style={{ marginTop: 8, paddingTop: 28, borderTop: '1px solid rgba(114,119,131,0.25)', display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn" disabled={profileSaving} style={{
              padding: '16px 34px', borderRadius: 999, border: 'none',
              background: 'var(--secondary)', color: 'var(--on-secondary)',
              fontWeight: 800, fontSize: 15, cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(220,159,13,0.4)', display: 'flex', alignItems: 'center', gap: 10,
              opacity: profileSaving ? 0.7 : 1,
            }}>
              {profileSaving ? 'Saving…' : 'Continue to Verify'} →
            </button>
          </div>
        </form>
      )}

      {/* ---------- Step 3: Verify ---------- */}
      {step === 3 && (
        <div className="glass-card pop-in" style={{ borderRadius: 32, padding: '44px 48px', display: 'flex', flexDirection: 'column', gap: 26, textAlign: 'center' }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', margin: '0 auto',
            background: 'var(--tertiary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
            boxShadow: '0 10px 24px -6px rgba(0,89,105,0.5)',
          }}>
            ✓
          </div>
          <div>
            <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 6px' }}>You're all set!</h2>
            <p style={{ color: 'var(--on-surface-variant)', fontSize: 14.5, margin: 0 }}>
              Review your details below, then start discovering grants matched to your mission.
            </p>
          </div>

          <div style={{ background: 'var(--surface-container-low)', borderRadius: 24, padding: '24px 28px', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--outline)', marginBottom: 4 }}>Account</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{user?.email}</div>
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--outline)', marginBottom: 4 }}>Organisation</div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{activeNgo?.name}</div>
              <div style={{ fontSize: 13, color: 'var(--on-surface-variant)', marginTop: 4, lineHeight: 1.5 }}>{activeNgo?.mission}</div>
            </div>
            {activeNgo?.sectors?.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {activeNgo.sectors.map(s => (
                  <span key={s} style={{ background: 'var(--secondary-container)', color: 'var(--on-secondary-container)', borderRadius: 999, padding: '4px 12px', fontSize: 12, fontWeight: 700 }}>
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>

          <button className="btn" onClick={() => navigate('/discovery')} style={{
            padding: '16px 34px', borderRadius: 999, border: 'none', alignSelf: 'center',
            background: 'var(--secondary)', color: 'var(--on-secondary)',
            fontWeight: 800, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 4px 16px rgba(220,159,13,0.4)', display: 'flex', alignItems: 'center', gap: 10,
          }}>
            Start Discovering Grants →
          </button>
        </div>
      )}
    </div>
  )
}
