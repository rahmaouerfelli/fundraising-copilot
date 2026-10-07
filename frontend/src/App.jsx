import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './context/AppContext'
import { ToastProvider } from './components/Toast'
import Navbar from './components/Navbar'
import WelcomePage from './pages/WelcomePage'
import OnboardingPage from './pages/OnboardingPage'
import LoginPage from './pages/LoginPage'
import DiscoveryPage from './pages/DiscoveryPage'
import PipelinePage from './pages/PipelinePage'
import ApplicationPage from './pages/ApplicationPage'
import DashboardPage from './pages/DashboardPage'

function Home() {
  const { user, activeNgo, loading } = useApp()
  if (loading) return null
  if (!user) return <Navigate to="/welcome" replace />
  if (!activeNgo) return <Navigate to="/onboarding" replace />
  return <Navigate to="/discovery" replace />
}

function RequireAuth({ children }) {
  const { user, loading } = useApp()
  const location = useLocation()
  if (loading) return null
  // Remember where the user was going, so the login page can send them back there.
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return children
}

function Shell() {
  const location = useLocation()
  const hideNavbar = ['/welcome', '/login'].includes(location.pathname)

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {!hideNavbar && <Navbar />}
      <main
        key={location.pathname}
        className="fade-in"
        style={{ flex: 1, width: '100%', maxWidth: 1200, margin: '0 auto', padding: hideNavbar ? '32px 24px' : '112px 24px 48px' }}
      >
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/welcome" element={<WelcomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/discovery" element={<RequireAuth><DiscoveryPage /></RequireAuth>} />
          <Route path="/pipeline" element={<RequireAuth><PipelinePage /></RequireAuth>} />
          <Route path="/apply/:grantId" element={<RequireAuth><ApplicationPage /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><DashboardPage /></RequireAuth>} />
        </Routes>
      </main>
      {!hideNavbar && (
        <footer style={{ padding: '28px 24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 12, color: 'var(--outline)', fontWeight: 600 }}>Powered by</span>
            <img src="/arc-en-ciel-logo.jpg" alt="Association Arc en Ciel" style={{ height: 22, width: 'auto', borderRadius: 4 }} />
          </div>
        </footer>
      )}
    </div>
  )
}

export default function App() {
  return (
    <ToastProvider>
      <AppProvider>
        <BrowserRouter>
          <Shell />
        </BrowserRouter>
      </AppProvider>
    </ToastProvider>
  )
}
