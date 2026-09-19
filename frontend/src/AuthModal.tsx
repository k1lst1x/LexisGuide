import { FormEvent, useState } from 'react'
import { signIn, signInWithRedirect, signUp } from 'aws-amplify/auth'

import { authConfigured } from './aws'

type Props = {
  onClose: () => void
  onSuccess: (email: string) => void
}

export function AuthModal({ onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!authConfigured) {
      setMessage('AWS authentication is not configured yet. Add the VITE_COGNITO_* values first.')
      return
    }
    setBusy(true)
    setMessage('')
    try {
      if (mode === 'signUp') {
        await signUp({ username: email, password, options: { userAttributes: { email } } })
        setMessage('Check your email to confirm your account, then sign in.')
      } else {
        const result = await signIn({ username: email, password })
        if (result.isSignedIn) onSuccess(email)
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Authentication failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  const socialSignIn = async (provider: 'Google' | 'SignInWithApple') => {
    if (!authConfigured) {
      setMessage('AWS authentication is not configured yet. Add the VITE_COGNITO_* values first.')
      return
    }
    await signInWithRedirect({ provider: { custom: provider } })
  }

  return <div className="auth-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="auth-close" onClick={onClose} aria-label="Close sign in">×</button>
      <p className="eyebrow"><span /> SECURE WORKSPACE ACCESS</p>
      <h2 id="auth-title">{mode === 'signIn' ? 'Welcome back.' : 'Create your workspace.'}</h2>
      <p className="auth-copy">Your account keeps documents, review history, and saved findings private to you.</p>
      <div className="social-auth">
        <button onClick={() => socialSignIn('Google')}>Continue with Google</button>
        <button onClick={() => socialSignIn('SignInWithApple')}>Continue with Apple</button>
      </div>
      <div className="auth-divider"><span>or use email</span></div>
      <form onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button className="orange-button auth-submit" disabled={busy}>{busy ? 'Working…' : mode === 'signIn' ? 'Sign in' : 'Create account'} <span className="arrow">↗</span></button>
      </form>
      {message && <p className="auth-message">{message}</p>}
      <button className="auth-switch" onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>{mode === 'signIn' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
    </section>
  </div>
}
