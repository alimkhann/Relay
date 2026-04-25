"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition, useRef, useEffect } from "react"
import { Eye, EyeOff } from "lucide-react"

import { authClient } from "@/lib/auth/client"
import { createClientFlowId, logClientEvent } from "@/lib/telemetry/client"
import { withAuthCallbackParams } from "@/lib/auth/auth-callback"
import { Button } from "@/components/ui/button"
import type { WebAuthIntent } from "@/server/policies/viewer"

// ── OtpCells ──────────────────────────────────────────────────────────────────

function OtpCells({
  value,
  onChange,
}: {
  value: string
  onChange: (val: string) => void
}) {
  const [cells, setCells] = useState<string[]>(() => {
    const arr = value.split("").slice(0, 6)
    while (arr.length < 6) arr.push("")
    return arr
  })
  const refs = useRef<Array<HTMLInputElement | null>>([])

  // Sync incoming value prop into cells
  useEffect(() => {
    const arr = value.split("").slice(0, 6)
    while (arr.length < 6) arr.push("")
    setCells(arr)
  }, [value])

  function update(next: string[]) {
    setCells(next)
    onChange(next.join(""))
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1)
    const next = [...cells]
    next[index] = digit
    update(next)
    if (digit && index < 5) {
      refs.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (cells[index] === "" && index > 0) {
        const next = [...cells]
        next[index - 1] = ""
        update(next)
        refs.current[index - 1]?.focus()
      } else {
        const next = [...cells]
        next[index] = ""
        update(next)
      }
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!pasted) return
    const next = pasted.split("")
    while (next.length < 6) next.push("")
    update(next)
    const focusIdx = Math.min(pasted.length, 5)
    refs.current[focusIdx]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center">
      {cells.map((cell, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]"
          maxLength={1}
          value={cell}
          autoComplete={i === 0 ? "one-time-code" : "off"}
          autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="h-14 w-11 rounded-[var(--relay-radius)] border border-[var(--relay-line-strong)] bg-[var(--relay-surface-raised)] text-center text-[22px] font-mono text-[var(--relay-ink)] outline-none transition [-webkit-text-fill-color:var(--relay-ink)] focus:border-[var(--relay-accent)] focus:ring-2 focus:ring-[var(--relay-accent)] focus:ring-offset-0"
        />
      ))}
    </div>
  )
}

// ── Password strength bar ──────────────────────────────────────────────────────

function passwordScore(password: string): number {
  if (password.length === 0) return 0
  if (password.length < 6) return 1
  const types = [/[A-Z]/, /[a-z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) =>
    re.test(password)
  ).length
  if (password.length < 8) return 2
  if (types === 1) return 2
  if (types === 2) return 3
  return 4
}

const SCORE_COLOR: Record<number, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
}

const SCORE_LABEL: Record<number, string> = {
  1: "Weak",
  2: "Fair",
  3: "Good",
  4: "Strong",
}

function PasswordStrengthBar({ password }: { password: string }) {
  const score = passwordScore(password)
  if (score === 0) return null
  return (
    <div className="mt-1 flex items-center gap-2">
      <div className="flex-1">
        <div
          className="h-1 rounded-full transition-all"
          style={{
            width: `${score * 25}%`,
            backgroundColor: SCORE_COLOR[score],
          }}
        />
      </div>
      <span
        className="shrink-0 text-[11px]"
        style={{ color: SCORE_COLOR[score] }}
      >
        {SCORE_LABEL[score]}
      </span>
    </div>
  )
}

// ── EmailSignInForm ────────────────────────────────────────────────────────────

export function EmailSignInForm({
  nextPath = "/dashboard",
  intent = "sign-in",
}: {
  nextPath?: string
  intent?: WebAuthIntent
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [otp, setOtp] = useState("")
  const [pendingVerification, setPendingVerification] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const [mode, setMode] = useState<"sign-in" | "sign-up">(
    intent === "sign-up" ? "sign-up" : "sign-in"
  )
  const fieldClass =
    "h-14 w-full rounded-[var(--relay-radius)] border border-[var(--relay-line-strong)] bg-[var(--relay-surface-raised)] px-4 text-[15px] text-[var(--relay-ink)] outline-none transition placeholder:text-[var(--relay-muted)] placeholder:opacity-50 focus:border-[var(--relay-muted)] focus:ring-0 [-webkit-text-fill-color:var(--relay-ink)] [&:-webkit-autofill]:shadow-[inset_0_0_0_1000px_var(--relay-surface-raised)] [&:-webkit-autofill]:[-webkit-text-fill-color:var(--relay-ink)]"

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    startTransition(async () => {
      setError(null)
      const flowId = createClientFlowId("email-auth")

      logClientEvent({
        level: "info",
        surface: "web-auth",
        area: "auth",
        event: mode === "sign-up" ? "email_sign_up.started" : "email_sign_in.started",
        flowId,
        message: `User started email ${mode} from the web app.`,
        context: { authMethod: "email", authIntent: mode },
      })

      try {
        if (mode === "sign-up" && pendingVerification) {
          const verifyRes = await fetch("/api/auth/email-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "verify", email, otp }),
          })
          const verifyData = (await verifyRes.json()) as { ok?: boolean; error?: string }
          if (!verifyRes.ok || !verifyData.ok) {
            throw new Error(verifyData.error ?? "Verification failed.")
          }

          const signInResult = await authClient.signIn.email({ email, password })
          if (signInResult.error) {
            throw new Error(signInResult.error.message ?? "Sign-in after verification failed.")
          }
        } else if (mode === "sign-up") {
          const result = await authClient.signUp.email({
            email,
            password,
            name: name || email.split("@")[0] || email,
          })
          if (result.error) {
            throw new Error(result.error.message ?? "Sign-up failed.")
          }

          const otpRes = await fetch("/api/auth/email-otp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "send", email }),
          })
          const otpData = (await otpRes.json()) as { ok?: boolean; error?: string }
          if (!otpRes.ok || !otpData.ok) {
            throw new Error(otpData.error ?? "Could not send verification code.")
          }

          setPendingVerification(true)
          setOtp("")
          return
        } else {
          const result = await authClient.signIn.email({
            email,
            password,
          })
          if (result.error) {
            throw new Error(result.error.message ?? "Sign-in failed.")
          }
        }

        logClientEvent({
          level: "info",
          surface: "web-auth",
          area: "auth",
          event: mode === "sign-up" ? "email_sign_up.succeeded" : "email_sign_in.succeeded",
          flowId,
          message: mode === "sign-up" ? "Email sign-up verified." : "Email sign-in completed.",
          context: { authMethod: "email", authIntent: mode },
        })

        router.replace(withAuthCallbackParams(nextPath, { method: "email", intent: mode }))
        router.refresh()
      } catch (cause) {
        logClientEvent({
          level: "error",
          surface: "web-auth",
          area: "auth",
          event: mode === "sign-up" ? "email_sign_up.failed" : "email_sign_in.failed",
          flowId,
          message: `Email ${mode} failed.`,
          context: { authMethod: "email", authIntent: mode },
          error: cause,
        })
        setError(cause instanceof Error ? cause.message : `Email ${mode} failed.`)
      }
    })
  }

  // ── OTP verification screen ──────────────────────────────────────────────────
  if (pendingVerification) {
    return (
      <form className="space-y-6" onSubmit={handleSubmit}>
        <button
          type="button"
          onClick={() => {
            setPendingVerification(false)
            setOtp("")
          }}
          className="flex items-center gap-1 text-[13px] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)] focus:outline-none"
        >
          <span aria-hidden="true">←</span> Back
        </button>

        <div className="space-y-1 text-center">
          <h2 className="text-[20px] font-semibold text-[var(--relay-ink)]">Check your email</h2>
          <p className="text-[14px] text-[var(--relay-muted)]">
            We sent a 6-digit code to <span className="text-[var(--relay-ink)]">{email}</span>
          </p>
        </div>

        <OtpCells value={otp} onChange={setOtp} />

        <Button
          className="h-14 w-full rounded-[var(--relay-radius)] bg-[var(--relay-accent)] px-6 text-[15px] font-semibold text-[var(--relay-accent-text)] shadow-sm transition-all hover:opacity-90 disabled:opacity-40"
          disabled={pending || otp.length < 6}
          type="submit"
        >
          {pending ? "Verifying…" : "Verify email"}
        </Button>

        {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      </form>
    )
  }

  // ── Main sign-in / sign-up form ──────────────────────────────────────────────
  return (
    <form className="space-y-4" onSubmit={handleSubmit}>
      {mode === "sign-up" && (
        <label className="block space-y-2">
          <span className="text-[13px] font-medium text-[var(--relay-ink-secondary)]">Full name</span>
          <input
            className={fieldClass}
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Your name"
            autoComplete="name"
          />
        </label>
      )}
      <label className="block space-y-2">
        <span className="text-[13px] font-medium text-[var(--relay-ink-secondary)]">Email address</span>
        <input
          className={fieldClass}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          autoComplete="email"
          required
        />
      </label>
      <label className="block space-y-2">
        <span className="text-[13px] font-medium text-[var(--relay-ink-secondary)]">Password</span>
        <span className="relative block">
          <input
            className={`${fieldClass} pr-12`}
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={mode === "sign-up" ? "Create a password" : "Password"}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
            required
            minLength={8}
          />
          <button
            type="button"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((current) => !current)}
            className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-[var(--relay-radius-sm)] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)] focus:outline-none"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </span>
        {mode === "sign-up" ? (
          <>
            <span className="block text-[12px] text-[var(--relay-muted)]">Must be at least 8 characters.</span>
            <PasswordStrengthBar password={password} />
          </>
        ) : null}
      </label>
      <Button
        className="h-14 w-full rounded-[var(--relay-radius)] bg-[var(--relay-accent)] px-6 text-[15px] font-semibold text-[var(--relay-accent-text)] shadow-sm transition-all hover:opacity-90 disabled:opacity-40"
        disabled={
          pending ||
          email.trim().length === 0 ||
          password.length < 8
        }
        type="submit"
      >
        {pending
          ? mode === "sign-up" ? "Creating account…" : "Signing in…"
          : mode === "sign-up" ? "Create account" : "Sign in with email"}
      </Button>
      {error ? <p className="text-sm text-rose-500">{error}</p> : null}
      <button
        type="button"
        onClick={() => {
          setMode(mode === "sign-in" ? "sign-up" : "sign-in")
          setError(null)
          setPendingVerification(false)
          setOtp("")
        }}
        className="w-full text-center text-[13px] text-[var(--relay-muted)] transition hover:text-[var(--relay-ink)] focus:outline-none"
      >
        {mode === "sign-in" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
      </button>
    </form>
  )
}
