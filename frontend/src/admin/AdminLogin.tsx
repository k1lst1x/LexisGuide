import { useState, type FormEvent } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import { authConfigured, cognitoConfirmNewPassword, cognitoGoogleSignIn, cognitoSignIn } from '../aws'
import { authErrorMessage } from '../authErrors'
import { RETURN_TO_ADMIN_KEY } from './route'
import { ErrorNote } from './ui'

type Props = { onSignedIn: () => void }

export function AdminLogin({ onSignedIn }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [needsNewPassword, setNeedsNewPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const result = needsNewPassword
        ? await cognitoConfirmNewPassword(newPassword)
        : await cognitoSignIn(email.trim(), password)
      const step = result.nextStep?.signInStep
      if (result.isSignedIn || step === 'DONE') {
        onSignedIn()
        return
      }
      if (step === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        // An account created with a temporary password must choose its own first.
        setNeedsNewPassword(true)
        return
      }
      setError('This account needs a sign-in step the admin portal does not support. Sign in through the main app first.')
    } catch (caught) {
      setError(authErrorMessage(caught))
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setError('')
    try {
      window.sessionStorage.setItem(RETURN_TO_ADMIN_KEY, '1')
      await cognitoGoogleSignIn()
    } catch (caught) {
      window.sessionStorage.removeItem(RETURN_TO_ADMIN_KEY)
      setError(authErrorMessage(caught))
    }
  }

  return (
    <main className="adm-gate">
      <section className="adm-gate-card" aria-labelledby="adm-login-title">
        <div className="adm-gate-mark" aria-hidden="true"><ShieldCheck size={22} /></div>
        <p className="adm-eyebrow">LexisGuide</p>
        <h1 id="adm-login-title">Admin portal</h1>
        <p className="adm-muted">
          {needsNewPassword
            ? 'Your account was created with a temporary password. Choose a new one to continue.'
            : 'Sign in with an account in the admins group.'}
        </p>

        {!authConfigured && (
          <ErrorNote message="Sign-in is not configured for this build. Set the VITE_COGNITO_* values and rebuild." />
        )}

        <form className="adm-form" onSubmit={submit}>
          {needsNewPassword ? (
            <label className="adm-field">
              <span>New password</span>
              <input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={12}
                required
                autoFocus
              />
              <small>At least 12 characters, with upper and lower case, a number, and a symbol.</small>
            </label>
          ) : (
            <>
              <label className="adm-field">
                <span>Email</span>
                <input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus />
              </label>
              <label className="adm-field">
                <span>Password</span>
                <input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
              </label>
            </>
          )}
          {error && <ErrorNote message={error} />}
          <button type="submit" className="adm-btn is-primary is-block" disabled={busy || !authConfigured}>
            {busy && <Loader2 size={15} className="adm-spin" aria-hidden="true" />}
            {needsNewPassword ? 'Set password and sign in' : 'Sign in'}
          </button>
        </form>

        {!needsNewPassword && (
          <>
            <div className="adm-or"><span>or</span></div>
            <button type="button" className="adm-btn is-block" onClick={google} disabled={!authConfigured}>
              Continue with Google
            </button>
          </>
        )}

        <a className="adm-back" href={import.meta.env.BASE_URL}>Back to LexisGuide</a>
      </section>
    </main>
  )
}
