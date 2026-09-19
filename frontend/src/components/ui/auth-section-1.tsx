"use client";

import { GrainGradient } from "@paper-design/shaders-react";
import { useState } from "react";
import type { ReactNode } from "react";

const termsText = (
  <>
    By creating an account, you agree to our{" "}
    <a
      href="#"
      className="font-medium text-black/60 underline underline-offset-2 hover:text-black"
    >
      Terms and Services
    </a>{" "}
    and{" "}
    <a
      href="#"
      className="font-medium text-black/60 underline underline-offset-2 hover:text-black"
    >
      Privacy Policy
    </a>
  </>
);

export type AuthSectionOneProps = {
  onSuccess?: (email: string) => void;
  onCancel?: () => void;
};

export default function AuthSectionOne({ onSuccess, onCancel }: AuthSectionOneProps) {
  const [firstName, setFirstName] = useState("Harshit");
  const [lastName, setLastName] = useState("Sharma");
  const [email, setEmail] = useState("harshitlog@gmail.com");
  const [password, setPassword] = useState("*************");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (onSuccess) {
      onSuccess(email);
    }
  };

  return (
    <section className="min-h-screen bg-white p-3 text-black antialiased [font-synthesis:none]">
      {onCancel && (
        <button
          onClick={onCancel}
          className="fixed top-6 right-6 z-50 rounded-full border border-black/15 bg-white/90 px-4 py-2 text-sm font-semibold shadow-sm backdrop-blur-md transition hover:bg-black/5 cursor-pointer"
        >
          ← Return to LexisGuide
        </button>
      )}
      <div className="grid min-h-[calc(100vh-1.5rem)] gap-6 lg:grid-cols-[0.94fr_1.06fr]">
        {/* Left Form Panel — Pure White Theme */}
        <div className="flex min-h-[760px] items-start rounded-md border border-black/15 bg-white px-6 py-12 sm:px-10 lg:min-h-0 lg:px-14 lg:py-28 xl:px-20 shadow-sm">
          <div className="mx-auto w-full max-w-[590px]">
            <div>
              <h1 className="whitespace-nowrap text-3xl font-semibold tracking-[-0.04em] text-black sm:text-4xl lg:text-[42px] lg:leading-[1.05] xl:text-[50px]">
                Create an account
              </h1>
              <p className="mt-3 whitespace-nowrap text-lg leading-snug text-black/60 sm:text-xl lg:text-2xl xl:text-3xl">
                Brainstorm in chat, build in cowork
              </p>
            </div>

            <div className="mt-12 grid gap-5 sm:grid-cols-2">
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

            <div className="my-10 text-center text-xl font-medium text-black/50">
              or
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              <div className="grid gap-5 sm:grid-cols-2">
                <FieldBox
                  label="First Name"
                  value={firstName}
                  onChange={setFirstName}
                />
                <FieldBox
                  label="Last Name"
                  value={lastName}
                  onChange={setLastName}
                />
              </div>

              <FieldBox
                label="Email"
                value={email}
                type="email"
                onChange={setEmail}
              />
              <FieldBox
                label="Password"
                value={password}
                type="password"
                onChange={setPassword}
              />

              <div className="space-y-4 pt-2 text-sm leading-5 text-black/50 sm:text-[15px]">
                <CheckboxLine>
                  I don't want to receive emails about solaceui feature updates
                </CheckboxLine>
                <CheckboxLine>{termsText}</CheckboxLine>
              </div>

              <button
                type="submit"
                className="mt-9 flex h-12 w-full items-center justify-center rounded-[10px] border border-black/30 bg-black text-xl font-medium text-white transition-all hover:bg-black/85 cursor-pointer shadow-md"
              >
                Submit
              </button>
            </form>
          </div>
        </div>

        {/* Right Hero Banner — Vibrant White & Light Shader Theme */}
        <div className="relative flex min-h-[720px] overflow-hidden rounded-md border border-black/10 bg-white p-8 text-black sm:p-12 lg:min-h-0 shadow-sm">
          <GrainGradient
            speed={1}
            scale={1}
            rotation={0}
            offsetX={0}
            offsetY={0}
            softness={0.6}
            intensity={0.4}
            noise={0.15}
            shape="corners"
            frame={2854.5}
            colors={["#FFFFFF", "#FF6B00", "#F97316", "#FFF5EE"]}
            colorBack="#FFFFFF"
            className="absolute inset-0 bg-white"
          />

          <div className="relative z-10 flex h-full w-full flex-col justify-between">
            <h2 className="max-w-[620px] pt-0 text-5xl font-semibold tracking-[-0.05em] text-black sm:text-6xl lg:pt-16 lg:text-[64px] lg:leading-[0.98] xl:text-[70px]">
              Think fast,
              <br />
              Build faster
            </h2>

            <a
              href="#"
              className="mb-0 inline-flex h-12 max-w-full items-center gap-3 rounded-[10px] border border-black/20 bg-white/70 px-5 text-base font-medium text-black backdrop-blur-md transition-colors hover:border-black/40 hover:bg-white xl:mb-32 xl:px-6 xl:text-2xl shadow-sm"
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
    <button
      type="button"
      onClick={onClick}
      className="flex h-12 items-center justify-center gap-3 rounded-[10px] border border-black/20 bg-white px-4 text-sm font-medium leading-none text-black transition-all hover:border-black/40 hover:bg-black/[0.02] xl:text-[18px] cursor-pointer shadow-sm"
    >
      <span className="shrink-0">{icon}</span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function FieldBox({
  label,
  value,
  type = "text",
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange?: (value: string) => void;
}) {
  const [inputValue, setInputValue] = useState(value);
  const [isEditing, setIsEditing] = useState(false);

  return (
    <label className="flex h-14 items-center justify-between gap-4 rounded-[10px] border border-black/20 bg-white px-5 text-lg leading-none transition-colors focus-within:border-black/60 xl:text-xl shadow-xs">
      <input
        type={type}
        value={inputValue}
        aria-label={label}
        onFocus={() => {
          if (!isEditing) {
            setInputValue("");
            setIsEditing(true);
          }
        }}
        onChange={(event) => {
          setInputValue(event.target.value);
          setIsEditing(true);
          if (onChange) onChange(event.target.value);
        }}
        className="min-w-0 flex-1 truncate bg-transparent text-black outline-none placeholder:text-black/30 font-normal"
      />
      {!isEditing && (
        <span className="shrink-0 text-black/60 font-medium text-base">{label}</span>
      )}
    </label>
  );
}

function CheckboxLine({ children }: { children: ReactNode }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <span className="relative mt-1 size-4 shrink-0">
        <input
          type="checkbox"
          className="peer size-full appearance-none rounded-[3px] border border-black/30 bg-white checked:border-black checked:bg-black"
        />
        <svg
          viewBox="0 0 12 12"
          className="pointer-events-none absolute inset-0 hidden size-full p-0.5 text-white peer-checked:block"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M3 6.2 5 8.1 9 3.9"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="text-black/70">{children}</span>
    </label>
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
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M17.05 12.54c-.03-3.02 2.47-4.47 2.58-4.54-1.41-2.06-3.6-2.34-4.38-2.37-1.86-.19-3.64 1.1-4.58 1.1-.95 0-2.42-1.07-3.98-1.04-2.05.03-3.94 1.19-4.99 3.02-2.13 3.69-.54 9.16 1.53 12.15 1.01 1.46 2.22 3.1 3.81 3.04 1.53-.06 2.11-.99 3.96-.99s2.37.99 3.99.96c1.65-.03 2.69-1.49 3.69-2.96 1.16-1.69 1.64-3.33 1.66-3.41-.04-.02-3.2-1.23-3.24-4.87ZM14.03 3.66c.84-1.02 1.41-2.43 1.25-3.84-1.21.05-2.68.81-3.55 1.83-.78.9-1.46 2.34-1.28 3.72 1.35.1 2.73-.69 3.58-1.71Z" />
    </svg>
  );
}

function WindowsIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3 4.7 10.7 3.6v7.7H3V4.7Zm8.8-1.25L21 2.1v9.2h-9.2V3.45ZM3 12.7h7.7v7.7L3 19.3v-6.6Zm8.8 0H21v9.2l-9.2-1.3v-7.9Z" />
    </svg>
  );
}
