"use client";

import { GrainGradient } from "@paper-design/shaders-react";
import { useState } from "react";
import type { ReactNode } from "react";

export type AuthSectionOneProps = {
  onSuccess?: (email: string) => void;
  onCancel?: () => void;
};

export default function AuthSectionOne({ onSuccess, onCancel }: AuthSectionOneProps) {
  const [firstName, setFirstName] = useState("Lexis");
  const [lastName, setLastName] = useState("User");
  const [email, setEmail] = useState("user@lexisguide.gov");
  const [password, setPassword] = useState("••••••••••••");
  const [remember, setRemember] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);

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
          ← Return to LexisGuide
        </button>
      )}

      <div className="auth-grid-card">
        {/* Left Column — Auth Form Fields */}
        <div className="auth-form-side">
          <div className="auth-form-inner">
            <div className="auth-header-block">
              <div className="auth-brand-badge">LexisGuide Auth</div>
              <h1 className="auth-heading">Create an account</h1>
              <p className="auth-subheading">
                Brainstorm in chat, build in cowork
              </p>
            </div>

            {/* Social Buttons */}
            <div className="auth-social-row">
              <SocialButton
                icon={<GoogleIcon />}
                label="Sign up with Google"
                onClick={() => onSuccess?.(email)}
              />
              <SocialButton
                icon={<AppleIcon />}
                label="Sign up with Apple"
                onClick={() => onSuccess?.(email)}
              />
            </div>

            <div className="auth-divider">
              <span>or continue with email</span>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="auth-main-form">
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

              <button type="submit" className="auth-submit-btn">
                Create Account & Open Workspace →
              </button>
            </form>
          </div>
        </div>

        {/* Right Column — Grain Gradient Shader Banner */}
        <div className="relative flex min-h-[720px] overflow-hidden rounded-r-2xl bg-black p-8 text-white sm:p-12 lg:min-h-0">
          <GrainGradient
            speed={1}
            scale={1}
            rotation={0}
            offsetX={0}
            offsetY={0}
            softness={0.5}
            intensity={0.5}
            noise={0.25}
            shape="corners"
            frame={2854.5}
            colors={["#FFFFFF", "#FC7819", "#FC7819", "#FFFFFF"]}
            colorBack="#00000000"
            className="absolute inset-0 bg-black"
          />

          <div className="relative z-10 flex h-full w-full flex-col justify-between">
            <h2 className="max-w-[620px] pt-0 text-5xl font-medium tracking-[-0.05em] text-white sm:text-6xl lg:pt-16 lg:text-[64px] lg:leading-[0.98] xl:text-[70px]">
              Think fast,
              <br />
              Build faster
            </h2>

            <a
              href="#"
              className="mb-0 inline-flex h-12 max-w-full items-center gap-3 rounded-[10px] border border-white/25 px-5 text-base font-medium text-white/85 backdrop-blur-sm transition-colors hover:border-white/45 hover:text-white xl:mb-12 xl:px-6 xl:text-xl"
            >
              <WindowsIcon className="size-5 shrink-0 xl:size-7" />
              <span className="truncate whitespace-nowrap">
                Download the windows app
              </span>
            </a>
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
  return (
    <div className="auth-field-group">
      <label className="auth-field-label">{label}</label>
      <input
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

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M3 4.7 10.7 3.6v7.7H3V4.7Zm8.8-1.25L21 2.1v9.2h-9.2V3.45ZM3 12.7h7.7v7.7L3 19.3v-6.6Zm8.8 0H21v9.2l-9.2-1.3v-7.9Z" />
    </svg>
  );
}
