import meadowBg from "@/assets/meadow_bg.webp";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import {
  authConfigured,
  cognitoConfirmResetPassword,
  cognitoGetCurrentUser,
  cognitoGoogleSignIn,
  cognitoResetPassword,
  cognitoSignIn,
  cognitoSignUp,
  setRememberDevice,
} from "../../aws";
import { authErrorMessage } from "../../authErrors";

export type AuthSectionOneProps = {
  onSuccess?: (email: string) => void;
  onCancel?: () => void;
  initialMode?: "sign-in" | "sign-up";
};

type Mode = "sign-in" | "sign-up" | "forgot" | "reset";

/** Mirrors the user pool's password policy (infra/main.tf). */
const PASSWORD_RULES: Array<[string, (value: string) => boolean]> = [
  ["12+ characters", (v) => v.length >= 12],
  ["Uppercase letter", (v) => /[A-Z]/.test(v)],
  ["Lowercase letter", (v) => /[a-z]/.test(v)],
  ["Number", (v) => /\d/.test(v)],
  ["Symbol", (v) => /[^A-Za-z0-9]/.test(v)],
];

export default function AuthSectionOne({ onSuccess, onCancel, initialMode = "sign-up" }: AuthSectionOneProps) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const isSignUp = mode === "sign-up";
  const panelIsSignUp = mode === "sign-up";

  const go = (next: Mode) => {
    setMode(next);
    setError("");
    setInfo("");
  };

  const finishSignIn = async () => {
    const user = await cognitoGetCurrentUser();
    onSuccess?.(user?.email || email.trim());
  };

  const run = async (task: () => Promise<void>) => {
    if (!authConfigured) {
      setError("Sign-in is unavailable in this build. Please try again later.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (caught) {
      const name = (caught as { name?: string })?.name;
      if (name === "UserAlreadyAuthenticatedException") {
        await finishSignIn();
      } else if (name === "UserNotConfirmedException") {
        // Sign-up confirms accounts server-side, so this only happens to
        // accounts made before that trigger existed. There is no code to
        // enter any more, so say who can fix it.
        setError("This account was created before sign-in changed and needs support to enable it. Please contact support@lexisguide.app.");
      } else {
        setError(authErrorMessage(caught));
      }
    } finally {
      setBusy(false);
    }
  };

  const signIn = () =>
    run(async () => {
      setRememberDevice(remember);
      const result = await cognitoSignIn(email.trim(), password);
      const step = result.nextStep?.signInStep;
      if (result.isSignedIn || step === "DONE") return finishSignIn();
      if (step === "CONFIRM_SIGN_UP") {
        // Amplify reports this as a step rather than throwing. Only accounts
        // made before sign-up started confirming itself can be in this state,
        // and no code can be sent to them, so name the way out.
        setError("This account was created before sign-in changed and needs support to enable it. Please contact support@lexisguide.app.");
        return;
      }
      if (step === "RESET_REQUIRED") {
        go("forgot");
        setInfo("This account needs a new password. We'll email you a reset code.");
        return;
      }
      setError("This account needs an extra sign-in step that isn't supported here yet.");
    });

  const signUp = () =>
    run(async () => {
      const name = `${firstName} ${lastName}`.trim();
      const result = await cognitoSignUp(email.trim(), password, name || undefined);
      if (result.nextStep?.signUpStep === "CONFIRM_SIGN_UP") {
        // The pool's pre-sign-up trigger confirms new accounts, so reaching
        // here means it is missing or failed. Do not invent a code step.
        setError("Sign-up could not be completed. Please contact support@lexisguide.app.");
        return;
      }
      setRememberDevice(remember);
      await cognitoSignIn(email.trim(), password);
      await finishSignIn();
    });

  const requestReset = () =>
    run(async () => {
      await cognitoResetPassword(email.trim());
      go("reset");
      setInfo(`We sent a reset code to ${email.trim()}.`);
    });

  const reset = () =>
    run(async () => {
      await cognitoConfirmResetPassword(email.trim(), code.trim(), newPassword);
      setPassword(newPassword);
      setRememberDevice(remember);
      await cognitoSignIn(email.trim(), newPassword);
      await finishSignIn();
    });

  const social = () =>
    run(async () => {
      await cognitoGoogleSignIn();
    });

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (mode === "sign-in") void signIn();
    else if (mode === "sign-up") void signUp();
    else if (mode === "forgot") void requestReset();
    else void reset();
  };

  const heading = {
    "sign-in": "Welcome back",
    "sign-up": "Create an account",
    forgot: "Reset your password",
    reset: "Choose a new password",
  }[mode];
  const subheading = {
    "sign-in": "Pick up where your legal review left off.",
    "sign-up": "Save your reviews and pick them up on any device.",
    forgot: "We'll email you a code to reset it.",
    reset: "Enter the code from your email and a new password.",
  }[mode];
  const submitLabel = busy
    ? "Please wait…"
    : { "sign-in": "Sign in", "sign-up": "Create account", forgot: "Send reset code", reset: "Reset password" }[mode];
  const passwordToCheck = mode === "reset" ? newPassword : password;

  return (
    <section className="auth-container-wrapper">
      {onCancel && (
        <button onClick={onCancel} className="auth-back-btn">
          <svg aria-hidden="true" className="auth-back-icon" viewBox="0 0 24 24">
            <path d="m9 14-5-5 5-5M4 9h11a5 5 0 0 1 5 5v1" />
          </svg>
          <span>Return to LexisGuide</span>
        </button>
      )}

      <div className={`auth-grid-card auth-mode-${panelIsSignUp ? "sign-up" : "sign-in"}`}>
        <div className="auth-form-side">
          <div className="auth-form-inner">
            <div className="auth-header-block">
              <div className="auth-brand-badge">LexisGuide account</div>
              <h1 className="auth-heading">{heading}</h1>
              <p className="auth-subheading">{subheading}</p>
            </div>

            {!authConfigured && (
              <div className="auth-notice" role="status">
                <span>Sign-in isn't available in this build yet. The workspace holds real documents, so there is no way in without an account.</span>
              </div>
            )}

            {(mode === "sign-in" || mode === "sign-up") && (
              <>
                <div className="auth-social-row">
                  <SocialButton icon={<GoogleIcon />} label={`${isSignUp ? "Sign up" : "Sign in"} with Google`} onClick={() => void social()} disabled={busy} />
                </div>
                <div className="auth-divider">
                  <span>{isSignUp ? "or continue with email" : "or sign in with email"}</span>
                </div>
              </>
            )}

            <form onSubmit={handleSubmit} className="auth-main-form" noValidate={false}>
              {info && <p className="auth-info" role="status">{info}</p>}
              {error && <p className="auth-error" role="alert">{error}</p>}

              {isSignUp && (
                <div className="auth-row-2col">
                  <FieldInput label="First Name" value={firstName} onChange={setFirstName} autoComplete="given-name" required={false} />
                  <FieldInput label="Last Name" value={lastName} onChange={setLastName} autoComplete="family-name" required={false} />
                </div>
              )}

              <FieldInput label="Email address" value={email} type="email" onChange={setEmail} autoComplete="email" readOnly={mode === "reset"} />

              {(mode === "sign-in" || mode === "sign-up") && (
                <FieldInput label="Password" value={password} type="password" onChange={setPassword} autoComplete={isSignUp ? "new-password" : "current-password"} />
              )}

              {mode === "reset" && (
                <FieldInput label="Verification code" value={code} onChange={setCode} autoComplete="one-time-code" inputMode="numeric" />
              )}

              {mode === "reset" && (
                <FieldInput label="New password" value={newPassword} type="password" onChange={setNewPassword} autoComplete="new-password" />
              )}

              {(isSignUp || mode === "reset") && (
                <ul className="auth-password-rules" aria-label="Password requirements">
                  {PASSWORD_RULES.map(([label, test]) => (
                    <li key={label} className={test(passwordToCheck) ? "is-met" : ""}>{label}</li>
                  ))}
                </ul>
              )}

              {isSignUp && (
                <div className="auth-checkboxes">
                  <label className="auth-checkbox-label">
                    <input type="checkbox" checked={agreeTerms} onChange={(e) => setAgreeTerms(e.target.checked)} required />
                    <span>
                      By creating an account, you agree to our <a href="#" className="auth-link">Terms & Services</a> and{" "}
                      <a href="#" className="auth-link">Privacy Policy</a>
                    </span>
                  </label>
                </div>
              )}

              {mode === "sign-in" && (
                <div className="auth-signin-options">
                  <label className="auth-checkbox-label">
                    <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                    <span>Keep me signed in on this device</span>
                  </label>
                  <button className="auth-text-button" type="button" onClick={() => go("forgot")}>Forgot password?</button>
                </div>
              )}

              <button type="submit" className="auth-submit-btn" disabled={busy}>{submitLabel}</button>

              {(mode === "forgot" || mode === "reset") && (
                <p className="auth-mobile-switch auth-inline-links">
                  <button type="button" onClick={() => go("sign-in")}>Back to sign in</button>
                </p>
              )}
              {(mode === "sign-in" || mode === "sign-up") && (
                <p className="auth-mobile-switch">
                  {isSignUp ? "Already have an account?" : "New to LexisGuide?"}{" "}
                  <button type="button" onClick={() => go(isSignUp ? "sign-in" : "sign-up")}>
                    {isSignUp ? "Sign in" : "Create account"}
                  </button>
                </p>
              )}
            </form>
          </div>
        </div>

        <div className="auth-gradient-wrapper">
          <div className="auth-gradient-box">
            {/* The same watercolor meadow as the landing page, so sign-in feels like part of it. */}
            <img src={meadowBg} alt="" aria-hidden="true" className="auth-meadow" />
            <div className="auth-switch-panel" key={panelIsSignUp ? "up" : "in"}>
              <span className="auth-switch-kicker">LEXISGUIDE WORKSPACE</span>
              <h2>{panelIsSignUp ? "Already reviewing with us?" : "New here?"}</h2>
              <p>
                {panelIsSignUp
                  ? "Sign in to return to your saved documents, findings, and next steps."
                  : "Create an account to save reviews and keep your legal documents organized."}
              </p>
              <button type="button" className="auth-switch-btn" onClick={() => go(panelIsSignUp ? "sign-in" : "sign-up")}>
                {panelIsSignUp ? "Sign in" : "Create an account"}
                <svg className="auth-switch-icon" aria-hidden="true" focusable="false" viewBox="0 0 24 24">
                  <path d={panelIsSignUp ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"} />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialButton({ icon, label, onClick, disabled }: { icon: ReactNode; label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="auth-social-btn" disabled={disabled}>
      <span className="auth-social-icon">{icon}</span>
      <span>{label}</span>
    </button>
  );
}

function FieldInput({
  label,
  value,
  type = "text",
  onChange,
  autoComplete,
  inputMode,
  readOnly,
  required = true,
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (val: string) => void;
  autoComplete?: string;
  inputMode?: "numeric" | "text" | "email";
  readOnly?: boolean;
  required?: boolean;
}) {
  const inputId = useId();
  return (
    <div className="auth-field-group">
      <label htmlFor={inputId} className="auth-field-label">{label}</label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="auth-field-input"
        autoComplete={autoComplete}
        inputMode={inputMode}
        readOnly={readOnly}
        required={required}
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z" fill="#34A853" />
      <path d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84Z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" fill="#EB4335" />
    </svg>
  );
}
