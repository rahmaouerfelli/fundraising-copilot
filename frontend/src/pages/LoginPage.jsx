import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { errorMessage } from '../api/client'
import { useApp } from '../context/AppContext'
import { useToast } from '../components/Toast'

const inputStyle = {
  width: '100%', background: 'var(--surface-container-low)', border: '1.5px solid transparent',
  borderRadius: 24, padding: '14px 22px', fontSize: 15, color: 'var(--on-surface)',
  outline: 'none', boxSizing: 'border-box', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.04)',
}
const labelStyle = { fontSize: 13.5, fontWeight: 700, color: 'var(--on-surface)', display: 'block', marginBottom: 8 }

export default function LoginPage() {
  const { user, loading, login } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()
  // Page the user was trying to open before being sent here (see RequireAuth in App.jsx).
  const from = location.state?.from?.pathname

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (loading) return null
  if (user) return <Navigate to={from || (user.ngo ? '/discovery' : '/onboarding')} replace />

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!email.trim() || !password) {
      setError('Please enter your email and password.')
      return
    }
    setSubmitting(true)
    try {
      const loggedIn = await login(email.trim(), password)
      toast.success(`Welcome back${loggedIn.full_name ? `, ${loggedIn.full_name.split(' ')[0]}` : ''}!`, { duration: 3000 })
      navigate(from || (loggedIn.ngo ? '/discovery' : '/onboarding'), { replace: true })
    } catch (err) {
      setError(err?.response?.status === 401 ? 'Incorrect email or password.' : errorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fade-in" style={{ minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
      <Link to="/welcome" aria-label="Back to home">
        <img src="/arc-en-ciel-logo.jpg" alt="Association Arc en Ciel" style={{ height: 44, width: 'auto', borderRadius: 8 }} />
      </Link>

      <form onSubmit={submit} className="glass-card pop-in" noValidate style={{
        width: 'min(440px, 100%)', borderRadius: 32, padding: '40px 40px 32px', display: 'flex', flexDirection: 'column', gap: 20,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <h1 className="display" style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px' }}>Welcome back</h1>
          <p style={{ margin: 0, color: 'var(--on-surface-variant)', fontSize: 14.5 }}>Log in to find and manage your grants.</p>
        </div>

        <div>
          <label htmlFor="login-email" style={labelStyle}>Email</label>
          <input
            id="login-email" type="email" autoComplete="email" autoFocus value={email}
            onChange={e => setEmail(e.target.value)} placeholder="you@organisation.org" style={inputStyle}
          />
        </div>

        <div>
          <label htmlFor="login-password" style={labelStyle}>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password}
              onChange={e => setPassword(e.target.value)} placeholder="Your password" style={{ ...inputStyle, paddingRight: 70 }}
            />
            <button
              type="button" onClick={() => setShowPassword(v => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              style={{
                position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                border: 'none', background: 'transparent', cursor: 'pointer',
                color: 'var(--primary)', fontWeight: 700, fontSize: 12.5, padding: '6px 10px', borderRadius: 999,
              }}
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {error && (
          <div role="alert" style={{ background: '#fef2f2', color: 'var(--error)', borderRadius: 16, padding: '10px 16px', fontSize: 13, fontWeight: 600 }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn" disabled={submitting} style={{
          padding: '15px 32px', borderRadius: 999, border: 'none', marginTop: 4,
          background: 'var(--secondary)', color: 'var(--on-secondary)', fontWeight: 800, fontSize: 15, cursor: 'pointer',
          boxShadow: '0 8px 20px -8px rgba(220,159,13,0.6)', opacity: submitting ? 0.7 : 1,
        }}>
          {submitting ? 'Logging in…' : 'Log in →'}
        </button>

        <div style={{ textAlign: 'center', fontSize: 14, color: 'var(--on-surface-variant)', paddingTop: 8, borderTop: '1px solid var(--outline-variant)' }}>
          No account yet?{' '}
          <Link to="/onboarding" style={{ color: 'var(--primary)', fontWeight: 700, textDecoration: 'none' }}>
            Create one
          </Link>
        </div>
      </form>
    </div>
  )
}
