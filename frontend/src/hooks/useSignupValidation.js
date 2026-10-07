import { useEffect, useState } from 'react'
import { authApi } from '../api/client'

// Same rules as the backend (schemas/auth.py).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function passwordRules(password) {
  return [
    { label: 'At least 8 characters', ok: password.length >= 8 },
    { label: 'At least one letter', ok: /\p{L}/u.test(password) },
    { label: 'At least one number', ok: /\d/.test(password) },
    { label: 'At most 72 bytes', ok: new TextEncoder().encode(password).length <= 72 },
  ]
}

// 0–4, for the strength bar: rules met + bonus for length and symbols.
export function passwordStrength(password) {
  if (!password) return 0
  let score = passwordRules(password).filter(r => r.ok).length >= 4 ? 2 : 1
  if (password.length >= 12) score += 1
  if (/[^\p{L}\d]/u.test(password) && /[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  return Math.min(score, 4)
}

/**
 * Live validation for the account form.
 * Returns per-field { error, ok } plus the email availability status and whether the form can be submitted.
 */
export function useSignupValidation(form, mode) {
  const [emailStatus, setEmailStatus] = useState('idle') // idle | checking | available | taken | error

  const email = form.email.trim()
  const emailFormatOk = EMAIL_RE.test(email)

  // Debounced availability check, only when signing up with a well-formed address.
  useEffect(() => {
    if (mode !== 'register' || !emailFormatOk) {
      setEmailStatus('idle')
      return
    }
    setEmailStatus('checking')
    let cancelled = false
    const timer = setTimeout(() => {
      authApi.emailAvailable(email)
        .then(r => { if (!cancelled) setEmailStatus(r.data.available ? 'available' : 'taken') })
        .catch(() => { if (!cancelled) setEmailStatus('error') })
    }, 450)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [email, emailFormatOk, mode])

  const rules = passwordRules(form.password)
  const passwordOk = rules.every(r => r.ok)
  const name = form.fullName.trim()

  const fields = {
    fullName: name && name.length < 2
      ? { error: 'Full name must be at least 2 characters.', ok: false }
      : { error: '', ok: name.length >= 2 },
    email: !email
      ? { error: 'Email is required.', ok: false }
      : !emailFormatOk
        ? { error: 'Enter a valid email address (e.g. name@organisation.org).', ok: false }
        : emailStatus === 'taken'
          ? { error: 'An account with this email already exists — use the "Log in" tab.', ok: false }
          : { error: '', ok: mode === 'login' || emailStatus === 'available' },
    password: mode === 'login'
      ? { error: form.password ? '' : 'Password is required.', ok: !!form.password }
      : { error: passwordOk ? '' : 'Password does not meet all the requirements.', ok: passwordOk },
    confirmPassword: !form.confirmPassword
      ? { error: 'Please confirm your password.', ok: false }
      : form.confirmPassword !== form.password
        ? { error: 'Passwords do not match.', ok: false }
        : { error: '', ok: true },
  }

  const canSubmit = mode === 'login'
    ? emailFormatOk && !!form.password
    : !fields.fullName.error && emailFormatOk && emailStatus !== 'taken' && emailStatus !== 'checking'
      && passwordOk && fields.confirmPassword.ok

  return { fields, rules, strength: passwordStrength(form.password), emailStatus, canSubmit }
}
