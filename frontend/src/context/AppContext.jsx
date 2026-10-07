import { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '../api/client'
import { useToast } from '../components/Toast'

const AppContext = createContext(null)

export function AppProvider({ children }) {
  const [user, setUser] = useState(null)
  const [activeNgo, setActiveNgo] = useState(null)
  const [loading, setLoading] = useState(true)
  const toast = useToast()

  useEffect(() => {
    const token = localStorage.getItem('gp_token')
    if (!token) {
      setLoading(false)
      return
    }
    authApi.me()
      .then(r => {
        setUser(r.data)
        setActiveNgo(r.data.ngo || null)
      })
      .catch(() => localStorage.removeItem('gp_token'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const onExpired = () => {
      localStorage.removeItem('gp_token')
      setUser(null)
      setActiveNgo(null)
      toast.warning('Your session has expired', { description: 'Please log in again.' })
    }
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [toast])

  const applyAuth = (data) => {
    localStorage.setItem('gp_token', data.access_token)
    setUser(data.user)
    setActiveNgo(data.user.ngo || null)
    return data.user
  }

  const register = async (email, password, fullName) => {
    const res = await authApi.register({ email, password, full_name: fullName })
    return applyAuth(res.data)
  }

  const login = async (email, password) => {
    const res = await authApi.login({ email, password })
    return applyAuth(res.data)
  }

  const logout = () => {
    localStorage.removeItem('gp_token')
    setUser(null)
    setActiveNgo(null)
  }

  const refreshUser = () =>
    authApi.me().then(r => {
      setUser(r.data)
      setActiveNgo(r.data.ngo || null)
      return r.data
    })

  const linkNgo = async (ngoId) => {
    const res = await authApi.linkNgo(ngoId)
    setUser(res.data)
    setActiveNgo(res.data.ngo || null)
    return res.data
  }

  return (
    <AppContext.Provider value={{
      user, activeNgo, setActiveNgo, loading,
      register, login, logout, refreshUser, linkNgo,
    }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
