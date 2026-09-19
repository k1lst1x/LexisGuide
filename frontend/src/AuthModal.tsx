import { FormEvent, useState } from 'react'

type Props = {
  onClose: () => void
  onSuccess: (email: string) => void
}

export function AuthModal({ onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSuccess(email.trim())
  }

  return <div className="auth-backdrop" role="presentation" onMouseDown={onClose}>
    <section className="auth-modal" role="dialog" aria-modal="true" aria-labelledby="auth-title" onMouseDown={(event) => event.stopPropagation()}>
      <button className="auth-close" onClick={onClose} aria-label="Close sign in">×</button>
      <p className="eyebrow"><span /> SECURE WORKSPACE ACCESS</p>
      <h2 id="auth-title">{mode === 'signIn' ? 'Welcome back.' : 'Create your workspace.'}</h2>
      <p className="auth-copy">Use any email and password to enter the local demo workspace. No external identity configuration is required.</p>
      <form onSubmit={submit}>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>Password<input type="password" autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} minLength={8} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <button className="orange-button auth-submit">{mode === 'signIn' ? 'Sign in' : 'Create account'} <span className="arrow">↗</span></button>
      </form>
      <button className="auth-switch" onClick={() => setMode(mode === 'signIn' ? 'signUp' : 'signIn')}>{mode === 'signIn' ? 'New here? Create an account' : 'Already have an account? Sign in'}</button>
    </section>
  </div>
}
