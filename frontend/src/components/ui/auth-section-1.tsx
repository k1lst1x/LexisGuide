"use client";

import meadowBg from "@/assets/meadow_bg.webp";
import { useId, useState } from "react";
import type { ReactNode } from "react";

export type AuthSectionOneProps = {
  onSuccess?: (email: string) => void;
  onCancel?: () => void;
  initialMode?: "sign-in" | "sign-up";
};

export default function AuthSectionOne({
  onSuccess,
  onCancel,
  initialMode = "sign-up",
}: AuthSectionOneProps) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">(initialMode);
  const [firstName, setFirstName] = useState("Lexis");
  const [lastName, setLastName] = useState("User");
  const [email, setEmail] = useState("user@lexisguide.gov");
  const [password, setPassword] = useState("••••••••••••");
  const [remember, setRemember] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const isSignUp = mode === "sign-up";

  const switchMode = () => setMode((current) => (current === "sign-up" ? "sign-in" : "sign-up"));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSuccess) {
      onSuccess(email);
    }
  };

  return (
    <section className="auth-container-wrapper">
      {/* Return button */}
      {onCancel && (
        <button onClick={onCancel} className="auth-back-btn">
          <svg
            aria-hidden="true"
            className="auth-back-icon"
            viewBox="0 0 24 24"
          >
            <path d="m9 14-5-5 5-5M4 9h11a5 5 0 0 1 5 5v1" />
          </svg>
          <span>Return to LexisGuide</span>
        </button>
      )}

      <div className={`auth-grid-card auth-mode-${mode}`}>
        {/* Left Column — Auth Form Fields */}
        <div className="auth-form-side">
          <div className="auth-form-inner">
            <div className="auth-header-block">
              <div className="auth-brand-badge">LexisGuide Auth</div>
              <h1 className="auth-heading">{isSignUp ? "Create an account" : "Welcome back"}</h1>
              <p className="auth-subheading">
                {isSignUp
                  ? "Build clearer paths through complex documents."
                  : "Pick up where your legal review left off."}
              </p>
            </div>

            {/* Social Buttons */}
            <div className="auth-social-row">
              <SocialButton
                icon={<GoogleIcon />}
                label={`${isSignUp ? "Sign up" : "Sign in"} with Google`}
                onClick={() => onSuccess?.(email)}
              />
              <SocialButton
                icon={<AppleIcon />}
                label={`${isSignUp ? "Sign up" : "Sign in"} with Apple`}
                onClick={() => onSuccess?.(email)}
              />
            </div>

            <div className="auth-divider">
              <span>{isSignUp ? "or continue with email" : "or sign in with email"}</span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="auth-main-form">
              {isSignUp && (
                <div className="auth-row-2col">
                  <FieldInput
                    label="First Name"
                    value={firstName}
                    onChange={setFirstName}
                  />
                  <FieldInput
                    label="Last Name"
                    value={lastName}
                    onChange={setLastName}
                  />
                </div>
              )}

              <FieldInput
                label="Email address"
                value={email}
                type="email"
                onChange={setEmail}
              />

              <FieldInput
                label="Password"
                value={password}
                type="password"
                onChange={setPassword}
              />

              {isSignUp ? (
                <div className="auth-checkboxes">
                  <label className="auth-checkbox-label">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>Send me product updates & procedural audit reports</span>
                  </label>

                  <label className="auth-checkbox-label">
                    <input
                      type="checkbox"
                      checked={agreeTerms}
                      onChange={(e) => setAgreeTerms(e.target.checked)}
                      required
                    />
                    <span>
                      By creating an account, you agree to our{" "}
                      <a href="#" className="auth-link">Terms & Services</a> and{" "}
                      <a href="#" className="auth-link">Privacy Policy</a>
                    </span>
                  </label>
                </div>
              ) : (
                <div className="auth-signin-options">
                  <label className="auth-checkbox-label">
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    <span>Keep me signed in on this device</span>
                  </label>
                  <button className="auth-text-button" type="button">Forgot password?</button>
                </div>
              )}

              <button type="submit" className="auth-submit-btn">
                {isSignUp ? "Create account" : "Sign in"}
              </button>
              <p className="auth-mobile-switch">
                {isSignUp ? "Already have an account?" : "New to LexisGuide?"}{" "}
                <button type="button" onClick={switchMode}>
                  {isSignUp ? "Sign in" : "Create account"}
                </button>
              </p>
            </form>
          </div>
        </div>

        {/* Right Column — Grain Gradient Shader Banner with top & bottom gap */}
        <div className="auth-gradient-wrapper">
          <div className="auth-gradient-box">
            {/* The same watercolor meadow as the landing page, so sign-in feels like part of it. */}
            <img src={meadowBg} alt="" aria-hidden="true" className="auth-meadow" />
            <div className="auth-switch-panel" key={mode}>
              <span className="auth-switch-kicker">LEXISGUIDE WORKSPACE</span>
              <h2>{isSignUp ? "Already reviewing with us?" : "New here?"}</h2>
              <p>
                {isSignUp
                  ? "Sign in to return to your saved documents, findings, and next steps."
                  : "Create an account to save reviews and keep your legal documents organized."}
              </p>
              <button type="button" className="auth-switch-btn" onClick={switchMode}>
                {isSignUp ? "Sign in" : "Create an account"}
                <svg
                  className="auth-switch-icon"
                  aria-hidden="true"
                  focusable="false"
                  viewBox="0 0 24 24"
                >
                  <path d={isSignUp ? "M19 12H5m6-6-6 6 6 6" : "M5 12h14m-6-6 6 6-6 6"} />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SocialButton({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button type="button" onClick={onClick} className="auth-social-btn">
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
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (val: string) => void;
}) {
  const inputId = useId();

  return (
    <div className="auth-field-group">
      <label className="auth-field-label" htmlFor={inputId}>
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        className="auth-field-input"
        required
      />
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23Z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.84Z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
        fill="#EB4335"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.05 12.54c-.03-3.02 2.47-4.47 2.58-4.54-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.58 1.1-.95 0-2.42-1.07-3.98-1.04-2.05.03-3.94 1.19-4.99 3.02-2.13 3.69-.54 9.16 1.53 12.15 1.01 1.46 2.22 3.1 3.81 3.04 1.53-.06 2.11-.99 3.96-.99s2.37.99 3.99.96c1.65-.03 2.69-1.49 3.69-2.96 1.16-1.69 1.64-3.33 1.66-3.41-.04-.02-3.2-1.23-3.24-4.87ZM14.03 3.66c.84-1.02 1.41-2.43 1.25-3.84-1.21.05-2.68.81-3.55 1.83-.78.9-1.46 2.34-1.28 3.72 1.35.1 2.73-.69 3.58-1.71Z" />
    </svg>
  );
}
