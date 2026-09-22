import { FormEvent, useState } from 'react'
import {
  authConfigured,
  cognitoConfirmSignUp,
  cognitoGoogleSignIn,
  cognitoAppleSignIn,
  cognitoSignIn,
  cognitoSignUp,
  cognitoResetPassword,
  cognitoConfirmResetPassword
} from './aws'

type Props = {
  onClose: () => void
  onSuccess: (email: string) => void
}

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback
}

export function AuthModal({ onClose, onSuccess }: Props) {
  const [mode, setMode] = useState<'signIn' | 'signUp' | 'confirm' | 'forgotPw' | 'resetPw'>('signIn')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmCode, setConfirmCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [loading, setLoading] = useState(false)
  const [shake, setShake] = useState(false)

  const triggerShake = () => {
    setShake(true)
    setTimeout(() => setShake(false), 500)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!authConfigured) {
      setErrorMsg('Sign-in is not configured for this deployment yet. Refresh after the AWS configuration is published.')
      return
    }
    setErrorMsg('')
    setLoading(true)

    try {
      if (mode === 'signIn') {
        const res = await cognitoSignIn(email.trim(), password)
        if (res.isSignedIn) {
          onSuccess(email.trim())
        } else if (res.nextStep?.signInStep === 'CONFIRM_SIGN_UP') {
          setMode('confirm')
        }
      } else if (mode === 'signUp') {
        const res = await cognitoSignUp(email.trim(), password)
        if (res.isSignUpComplete) {
          onSuccess(email.trim())
        } else {
          setMode('confirm')
        }
      } else if (mode === 'confirm') {
        await cognitoConfirmSignUp(email.trim(), confirmCode.trim())
        onSuccess(email.trim())
      } else if (mode === 'forgotPw') {
        await cognitoResetPassword(email.trim())
        setMode('resetPw')
      } else if (mode === 'resetPw') {
        await cognitoConfirmResetPassword(email.trim(), confirmCode.trim(), newPassword)
        setMode('signIn')
        setErrorMsg('')
      }
    } catch (error: unknown) {
      const msg = getErrorMessage(error, 'Authentication error. Please try again.')
      setErrorMsg(msg)
      triggerShake()
    } finally {
      setLoading(false)
    }
  }

  const handleGoogle = async () => {
    if (!authConfigured) {
      setErrorMsg('Sign-in is not configured for this deployment yet. Refresh after the AWS configuration is published.')
      return
    }
    setErrorMsg('')
    setLoading(true)
    try {
      await cognitoGoogleSignIn()
    } catch (error: unknown) {
      setErrorMsg(getErrorMessage(error, 'Google sign-in failed. Ensure Google is configured in Cognito.'))
      triggerShake()
      setLoading(false)
    }
  }

  const handleApple = async () => {
    if (!authConfigured) {
      setErrorMsg('Sign-in is not configured for this deployment yet. Refresh after the AWS configuration is published.')
      return
    }
    setErrorMsg('')
    setLoading(true)
    try {
      await cognitoAppleSignIn()
    } catch (error: unknown) {
      setErrorMsg(getErrorMessage(error, 'Apple sign-in failed. Ensure Apple is configured in Cognito.'))
      triggerShake()
      setLoading(false)
    }
  }

  const titleMap = {
    signIn: 'Welcome back.',
    signUp: 'Create your account.',
    confirm: 'Verify your email.',
    forgotPw: 'Reset your password.',
    resetPw: 'Enter new password.',
  }

  const subtitleMap = {
    signIn: 'Sign in with your AWS Cognito credentials.',
    signUp: 'Create a new account with email & password.',
    confirm: `Enter the verification code sent to ${email}.`,
    forgotPw: 'Enter your email to receive a reset code.',
    resetPw: 'Enter the code and your new password.',
  }

  return (
    <div className="auth-backdrop" role="presentation" onMouseDown={onClose}>
      <section 
        className={`auth-modal ${shake ? 'auth-shake' : ''}`}
        role="dialog" 
        aria-modal="true" 
        aria-labelledby="auth-title" 
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button className="auth-close" onClick={onClose} aria-label="Close modal">×</button>
        <p className="eyebrow"><span /> AWS COGNITO SECURE AUTHENTICATION</p>

        <h2 id="auth-title">{titleMap[mode]}</h2>
        <p className="auth-copy">{subtitleMap[mode]}</p>

        {errorMsg && <div className="auth-error-banner">{errorMsg}</div>}

        {(mode === 'signIn' || mode === 'signUp') && (
          <div className="social-auth-buttons">
            <button type="button" className="social-auth-btn google-btn" onClick={handleGoogle} disabled={loading || !authConfigured}>
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>Continue with Google</span>
            </button>

            <button type="button" className="social-auth-btn apple-btn" onClick={handleApple} disabled={loading || !authConfigured}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 6.35c.67-.82 1.13-1.97.99-3.12-.98.04-2.18.66-2.88 1.47-.62.72-1.16 1.89-1.01 3.02 1.1.09 2.23-.55 2.9-1.37z"/>
              </svg>
              <span>Continue with Apple</span>
            </button>
          </div>
        )}

        {(mode === 'signIn' || mode === 'signUp') && (
          <div className="auth-divider">
            <span>OR EMAIL</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {(mode === 'signIn' || mode === 'signUp' || mode === 'forgotPw') && (
            <label>
              Email
              <input 
                type="email" 
                autoComplete="email" 
                value={email} 
                onChange={(event) => setEmail(event.target.value)} 
                required 
              />
            </label>
          )}

          {(mode === 'signIn' || mode === 'signUp') && (
            <label>
              Password
              <input 
                type="password" 
                autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} 
                minLength={8} 
                value={password} 
                onChange={(event) => setPassword(event.target.value)} 
                required 
              />
            </label>
          )}

          {mode === 'confirm' && (
            <label>
              Verification Code
              <input 
                type="text" 
                placeholder="123456" 
                value={confirmCode} 
                onChange={(event) => setConfirmCode(event.target.value)} 
                required 
              />
            </label>
          )}

          {mode === 'resetPw' && (
            <>
              <label>
                Reset Code
                <input 
                  type="text" 
                  placeholder="123456" 
                  value={confirmCode} 
                  onChange={(event) => setConfirmCode(event.target.value)} 
                  required 
                />
              </label>
              <label>
                New Password
                <input 
                  type="password" 
                  autoComplete="new-password"
                  minLength={8} 
                  value={newPassword} 
                  onChange={(event) => setNewPassword(event.target.value)} 
                  required 
                />
              </label>
            </>
          )}

          <button className="auth-submit-btn" disabled={loading || !authConfigured}>
            {loading && <span className="auth-spinner" />}
            {loading 
              ? 'Connecting to AWS...' 
              : mode === 'signIn' 
                ? 'Sign in with AWS Cognito ↗' 
                : mode === 'signUp' 
                  ? 'Create AWS Account ↗' 
                  : mode === 'confirm'
                    ? 'Verify & Sign in ↗'
                    : mode === 'forgotPw'
                      ? 'Send Reset Code ↗'
                      : 'Reset Password ↗'}
          </button>
        </form>

        <div className="auth-bottom-links">
          {mode === 'signIn' && (
            <>
              <button type="button" className="auth-switch" onClick={() => setMode('signUp')}>
                New here? Create an AWS account
              </button>
              <button type="button" className="auth-switch" onClick={() => setMode('forgotPw')}>
                Forgot password?
              </button>
            </>
          )}
          {mode === 'signUp' && (
            <button type="button" className="auth-switch" onClick={() => setMode('signIn')}>
              Already have an account? Sign in
            </button>
          )}
          {mode === 'confirm' && (
            <button type="button" className="auth-switch" onClick={() => setMode('signUp')}>
              Back to account creation
            </button>
          )}
          {(mode === 'forgotPw' || mode === 'resetPw') && (
            <button type="button" className="auth-switch" onClick={() => setMode('signIn')}>
              Back to sign in
            </button>
          )}
        </div>
      </section>
    </div>
  )
}
