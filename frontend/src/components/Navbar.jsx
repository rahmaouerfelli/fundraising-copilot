import { NavLink, useNavigate } from 'react-router-dom'
import { useApp } from '../context/AppContext'
import { useToast } from './Toast'

const NAV = [
  { to: '/discovery', label: 'Discover' },
  { to: '/pipeline', label: 'Pipeline' },
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/onboarding', label: 'NGO Profile' },
]

export default function Navbar() {
  const { user, activeNgo, logout } = useApp()
  const navigate = useNavigate()
  const toast = useToast()
  const initials = (activeNgo?.name || user?.email || '')
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

  const handleLogout = () => {
    logout()
    navigate('/login')
    toast.info('You have been logged out', { description: 'Log in again to get back to your grants.', duration: 3500 })
  }

  return (
    <nav className="glass-nav" style={{
      position: 'fixed', top: 16, left: '50%', transform: 'translateX(-50%)',
      width: '94%', maxWidth: 1200, borderRadius: 999, zIndex: 100,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 0, padding: '10px 14px 10px 26px' }}>
        <img
          src="/arc-en-ciel-logo.jpg"
          alt="Association Arc en Ciel"
          style={{ height: 32, width: 'auto', marginRight: 32, flexShrink: 0, borderRadius: 6 }}
        />

        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {NAV.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className="nav-link"
              style={({ isActive }) => ({
                padding: '9px 16px',
                borderRadius: 999,
                fontWeight: 600,
                fontSize: 13.5,
                textDecoration: 'none',
                color: isActive ? 'var(--primary)' : 'var(--on-surface-variant)',
                background: isActive ? 'rgba(27,79,145,0.1)' : 'transparent',
              })}
            >
              {label}
            </NavLink>
          ))}
        </div>

        {!user && (
          <button className="btn" onClick={() => navigate('/login')} style={{
            padding: '9px 20px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: 'var(--primary)', color: '#fff', fontWeight: 700, fontSize: 13.5,
          }}>
            Log in
          </button>
        )}

        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              fontSize: 13, color: 'var(--on-surface)', fontWeight: 600,
              background: 'var(--surface-container-low)', borderRadius: 999, padding: '5px 14px 5px 5px',
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary), var(--secondary))',
                color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 11, fontWeight: 800,
              }}>
                {initials || '·'}
              </div>
              {activeNgo?.name || user.email}
            </div>
            <button className="btn" onClick={handleLogout} title="Log out" aria-label="Log out" style={{
              width: 34, height: 34, borderRadius: '50%', border: '1px solid var(--outline-variant)',
              background: '#fff', cursor: 'pointer', fontSize: 14, color: 'var(--on-surface-variant)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              ⏻
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}
