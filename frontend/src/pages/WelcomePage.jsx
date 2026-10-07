import { useNavigate } from 'react-router-dom'

const STEPS = [
  { n: '01', icon: '🏷️', title: 'Tell us about your NGO', text: 'Mission, sectors, beneficiaries, budget — a two-minute profile.' },
  { n: '02', icon: '🤖', title: 'The AI agent goes to work', text: 'It scans grant sources and ranks opportunities against your profile.' },
  { n: '03', icon: '🚀', title: 'Apply with a head start', text: 'Draft, track, and submit applications from one pipeline board.' },
]

export default function WelcomePage() {
  const navigate = useNavigate()

  return (
    <div className="fade-in">
      <nav style={{
        maxWidth: 1200, margin: '0 auto', padding: '28px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <img src="/arc-en-ciel-logo.jpg" alt="Association Arc en Ciel" style={{ height: 36, width: 'auto', borderRadius: 6 }} />
        <button className="btn" onClick={() => navigate('/login')} style={{
          padding: '10px 24px', borderRadius: 999, cursor: 'pointer', fontWeight: 700, fontSize: 14,
          border: '1.5px solid var(--primary)', background: 'transparent', color: 'var(--primary)',
        }}>
          Log in
        </button>
      </nav>

      {/* Hero */}
      <div style={{ maxWidth: 780, margin: '0 auto', padding: '64px 24px 40px', textAlign: 'center' }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          background: 'rgba(27,79,145,0.08)', border: '1px solid rgba(27,79,145,0.15)',
          borderRadius: 999, padding: '7px 18px', fontSize: 12.5, fontWeight: 700,
          color: 'var(--primary)', marginBottom: 30,
        }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--tertiary-fixed-dim)', boxShadow: '0 0 0 3px rgba(245,197,24,0.3)' }} />
          AI Agent for Grant Fundraising
        </div>

        <h1 className="display" style={{
          fontSize: 58, fontWeight: 800, margin: '0 0 22px', letterSpacing: -1.5, lineHeight: 1.08,
          color: 'var(--on-surface)',
        }}>
          Fund your mission,<br />
          <span style={{ color: 'var(--primary)' }}>not your paperwork.</span>
        </h1>
        <p style={{ fontSize: 17.5, color: 'var(--on-surface-variant)', lineHeight: 1.65, margin: '0 auto 40px', maxWidth: 540 }}>
          Tell us about your NGO once. Our AI agent scans grant sources, ranks every
          opportunity against your mission, and helps you draft winning applications.
        </p>

        <button
          className="btn"
          onClick={() => navigate('/onboarding')}
          style={{
            padding: '18px 42px', borderRadius: 999, border: 'none',
            background: 'var(--secondary)', color: 'var(--on-secondary)',
            fontWeight: 800, fontSize: 16, cursor: 'pointer',
            boxShadow: '0 10px 28px -8px rgba(220,159,13,0.6)',
            display: 'inline-flex', alignItems: 'center', gap: 10,
          }}
        >
          Set up your NGO profile →
        </button>
        <div style={{ marginTop: 18, fontSize: 12.5, color: 'var(--outline)', fontWeight: 600 }}>
          Takes about 2 minutes · Free to start
        </div>
        <div style={{ marginTop: 14, fontSize: 14, color: 'var(--on-surface-variant)' }}>
          Already have an account?{' '}
          <button onClick={() => navigate('/login')} style={{
            border: 'none', background: 'none', padding: 0, cursor: 'pointer',
            color: 'var(--primary)', fontWeight: 700, fontSize: 14, textDecoration: 'underline', textUnderlineOffset: 3,
          }}>
            Log in
          </button>
        </div>
      </div>

      {/* Hero visual band */}
      <div className="glass-card" style={{
        maxWidth: 900, margin: '0 auto 84px', borderRadius: 32, padding: '32px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-around', flexWrap: 'wrap', gap: 24,
      }}>
        {[['🎯', 'AI Matching'], ['📋', 'Pipeline Tracking'], ['✍️', 'AI-Drafted Applications']].map(([icon, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14, flexShrink: 0,
              background: 'linear-gradient(135deg, var(--primary), var(--primary-container))',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20,
            }}>
              {icon}
            </div>
            <span style={{ fontWeight: 700, fontSize: 14.5, color: 'var(--on-surface)' }}>{label}</span>
          </div>
        ))}
      </div>

      {/* How it works */}
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '0 24px 100px' }}>
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--tertiary)', marginBottom: 10 }}>
            How it works
          </div>
          <h2 className="display" style={{ fontSize: 32, fontWeight: 700, margin: 0, color: 'var(--on-surface)' }}>
            Three steps to your next grant
          </h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24, position: 'relative' }}>
          {STEPS.map((s, i) => (
            <div key={s.n} className="glass-card card-hover" style={{
              borderRadius: 28, padding: '30px 26px', textAlign: 'left', position: 'relative',
            }}>
              <div style={{
                position: 'absolute', top: 22, right: 24, fontSize: 36, fontWeight: 800,
                color: 'rgba(25,28,30,0.06)', fontFamily: "'Montserrat', sans-serif",
              }}>
                {s.n}
              </div>
              <div style={{
                width: 48, height: 48, borderRadius: 15, marginBottom: 18,
                background: 'linear-gradient(135deg, var(--primary), var(--primary-container))',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
                boxShadow: '0 8px 18px -6px rgba(27,79,145,0.5)',
              }}>
                {s.icon}
              </div>
              <div style={{ fontWeight: 800, fontSize: 16, color: 'var(--on-surface)', marginBottom: 8 }}>{s.title}</div>
              <div style={{ fontSize: 13.5, color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>{s.text}</div>
            </div>
          ))}
        </div>
      </div>

      <footer style={{ borderTop: '1px solid var(--outline-variant)', padding: '40px 24px' }}>
        <div style={{
          maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column',
          alignItems: 'center', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--outline)', fontWeight: 600 }}>Powered by</span>
            <img src="/arc-en-ciel-logo.jpg" alt="Association Arc en Ciel" style={{ height: 26, width: 'auto', borderRadius: 5 }} />
          </div>
          <div style={{ fontSize: 12, color: 'var(--outline)' }}>
            © 2026 GrantPartner. Built for NGOs doing the work.
          </div>
        </div>
      </footer>
    </div>
  )
}
