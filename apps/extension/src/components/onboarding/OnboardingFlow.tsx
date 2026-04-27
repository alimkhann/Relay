import { useState, useEffect, useRef } from "react"
import OpenAI from "@lobehub/icons/es/OpenAI"
import Claude from "@lobehub/icons/es/Claude"
import Gemini from "@lobehub/icons/es/Gemini"
import Grok from "@lobehub/icons/es/Grok"
import Perplexity from "@lobehub/icons/es/Perplexity"
import DeepSeek from "@lobehub/icons/es/DeepSeek"
import ClaudeCode from "@lobehub/icons/es/ClaudeCode"
import Cursor from "@lobehub/icons/es/Cursor"
import Codex from "@lobehub/icons/es/Codex"
import Antigravity from "@lobehub/icons/es/Antigravity"
import Windsurf from "@lobehub/icons/es/Windsurf"
import GithubCopilot from "@lobehub/icons/es/GithubCopilot"
import { relayFetch } from "../../utils/api"
import styles from "./OnboardingFlow.module.css"

const BASE_URL = "https://onrelay.app"
const STEP_KEY = "relay.onboarding.htmlStep"
const TOTAL_STEPS = 5

const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
const modKey = isMac ? "⌘" : "Ctrl"
const altKey = isMac ? "⌥" : "Alt"

const FEATURES = [
  {
    label: "AUTO-CAPTURE",
    title: "Quietly saves what matters from every AI chat",
    desc: "Work in ChatGPT, Claude, or Gemini. Relay captures decisions, tasks, and constraints automatically.",
    video: `${BASE_URL}/videos/auto-capture.mp4`,
    poster: `${BASE_URL}/images/video-posters/auto-capture.webp`,
  },
  {
    label: "PROJECT BRIEFS",
    title: "One-click context restoration in fresh chats",
    desc: "Your project brief updates itself as you work. Inject the full context instantly.",
    video: `${BASE_URL}/videos/project-briefs.mp4`,
    poster: `${BASE_URL}/images/video-posters/project-briefs.webp`,
  },
  {
    label: "MCP INTEGRATION",
    title: "Your coding agent reads and writes project memory",
    desc: "Claude Code, Cursor, and any MCP-compatible agent connect directly to the same brief.",
    video: `${BASE_URL}/videos/mcp-integration.mp4`,
    poster: `${BASE_URL}/images/video-posters/mcp-integration.webp`,
  },
  {
    label: "CROSS-SURFACE SYNC",
    title: "Decisions flow between tools automatically",
    desc: "A choice made in ChatGPT surfaces in Cursor. Constraints stay in sync across every session.",
    video: `${BASE_URL}/videos/cross-surface-sync.mp4`,
    poster: `${BASE_URL}/images/video-posters/cross-surface-sync.webp`,
  },
]

const ROW1_ICONS = [OpenAI, Claude, Gemini, Grok, Perplexity, DeepSeek, OpenAI, Claude, Gemini, Grok, Perplexity, DeepSeek]
const ROW2_ICONS = [ClaudeCode, Cursor, Codex, Antigravity, Windsurf, GithubCopilot, ClaudeCode, Cursor, Codex, Antigravity, Windsurf, GithubCopilot]
const ROW3_ICONS = [Grok, DeepSeek, OpenAI, ClaudeCode, Cursor, Windsurf, Gemini, Perplexity, Codex, Claude, Antigravity, GithubCopilot]

function MarqueeRow({ icons, reverse }: { icons: typeof ROW1_ICONS; reverse?: boolean }) {
  const doubled = [...icons, ...icons]
  return (
    <div className={styles.marqueeRow}>
      <div className={`${styles.marqueeTrack} ${reverse ? styles.marqueeReverse : ""}`}>
        {doubled.map((Icon, i) => (
          <div key={i} className={styles.bgIconCell}>
            <Icon.Avatar size={48} />
          </div>
        ))}
      </div>
    </div>
  )
}

function FeatureCard({ label, title, desc, video, poster }: { label: string; title: string; desc: string; video: string; poster: string }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  function handleMouseEnter() {
    if (videoRef.current) {
      videoRef.current.currentTime = 0
      void videoRef.current.play()
    }
  }

  function handleMouseLeave() {
    if (videoRef.current) {
      videoRef.current.pause()
    }
  }

  function handleClick() {
    chrome.tabs.create({ url: video }).catch(() => window.open(video, "_blank"))
  }

  return (
    <div className={styles.featureCard} onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave} onClick={handleClick} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && handleClick()}>
      <div className={styles.featureMedia}>
        <video ref={videoRef} src={video} poster={poster} muted playsInline loop preload="metadata" />
      </div>
      <div className={styles.featureBody}>
        <p className={styles.featureLabel}>{label}</p>
        <p className={styles.featureTitle}>{title}</p>
        <p className={styles.featureDesc}>{desc}</p>
      </div>
    </div>
  )
}

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18">
      <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z" />
      <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z" />
    </svg>
  )
}

function XLogo() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.632 5.905-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z" />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  )
}

function KbdKey({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <span className={`${styles.kbdKey} ${wide ? styles.kbdKeyWide : ""}`}>{children}</span>
}

export function OnboardingFlow() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [intent, setIntent] = useState<"sign-in" | "sign-up">("sign-in")
  const [otpRequired, setOtpRequired] = useState(false)
  const [otp, setOtp] = useState("")

  useEffect(() => {
    document.title = "Welcome to Relay — Let's Get Started"
    chrome.storage.local.get([STEP_KEY, "relay.session"], (result: Record<string, unknown>) => {
      const session = result["relay.session"] as Record<string, unknown> | undefined
      setIsSignedIn(session?.connected === true)
      const saved = result[STEP_KEY]
      if (typeof saved === "number" && saved >= 0 && saved < TOTAL_STEPS) setStep(saved)
    })
    setTimeout(() => setVisible(true), 50)
  }, [])

  function goTo(next: number) {
    setVisible(false)
    setTimeout(() => {
      setStep(next)
      chrome.storage.local.set({ [STEP_KEY]: next })
      setVisible(true)
    }, 220)
  }

  function next() { goTo(step + 1) }

  async function dismissWalkthrough() {
    try {
      await relayFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ walkthrough: { dismissedAt: new Date().toISOString() } }),
      })
    } catch { /* best-effort */ }
  }

  async function handleGoogleSignIn() {
    setAuthBusy(true)
    setAuthError(null)
    try {
      const deviceName = isMac ? "Relay on Mac" : "Relay on browser"
      const result = await chrome.runtime.sendMessage({
        type: "RELAY_GOOGLE_SIGN_IN",
        payload: { deviceName },
      }) as { ok: boolean; reason?: string } | undefined
      if (result?.ok) { setIsSignedIn(true); goTo(3) }
      else setAuthError(result?.reason ?? "Sign-in failed. Try again.")
    } catch {
      setAuthError("Sign-in failed. Try again.")
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleEmailAuth() {
    if (!email.trim() || !password.trim()) return
    setAuthBusy(true)
    setAuthError(null)
    try {
      const deviceName = isMac ? "Relay on Mac" : "Relay on browser"
      const result = await chrome.runtime.sendMessage({
        type: "RELAY_EMAIL_SIGN_IN",
        payload: {
          email: email.trim(),
          password,
          intent,
          name: intent === "sign-up" && name.trim() ? name.trim() : undefined,
          deviceName,
        },
      }) as { ok: boolean; requiresOtp?: boolean; reason?: string; message?: string } | undefined
      if (result?.ok && result.requiresOtp) {
        setOtpRequired(true)
        setAuthError(result.message ?? "Check your email for a verification code.")
      } else if (result?.ok) {
        setIsSignedIn(true)
        goTo(3)
      } else {
        setAuthError(result?.reason ?? "Sign-in failed. Try again.")
      }
    } catch {
      setAuthError("Sign-in failed. Try again.")
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleOtpVerify() {
    if (!otp.trim()) return
    setAuthBusy(true)
    setAuthError(null)
    try {
      const deviceName = isMac ? "Relay on Mac" : "Relay on browser"
      const result = await chrome.runtime.sendMessage({
        type: "RELAY_EMAIL_SIGN_IN",
        payload: { email: email.trim(), password, intent, otp: otp.trim(), deviceName },
      }) as { ok: boolean; reason?: string } | undefined
      if (result?.ok) { setIsSignedIn(true); goTo(3) }
      else setAuthError(result?.reason ?? "Invalid code. Try again.")
    } catch {
      setAuthError("Verification failed. Try again.")
    } finally {
      setAuthBusy(false)
    }
  }

  async function handleOpenRelay() {
    if (isSignedIn) await dismissWalkthrough()
    chrome.storage.local.remove(STEP_KEY)
    try {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const windowId = tabs[0]?.windowId
      if (windowId) await chrome.sidePanel.open({ windowId })
    } catch { /* best-effort */ }
    window.close()
  }

  const stepClass = visible ? styles.stepVisible : styles.stepEnter

  return (
    <div className={styles.root}>
      <div className={`${styles.step} ${stepClass}`}>
        {step === 0 && <StepWelcome onNext={next} />}
        {step === 1 && <StepFeatures onNext={next} />}
        {step === 2 && (
          <StepAuth
            authBusy={authBusy}
            authError={authError}
            email={email}
            name={name}
            password={password}
            showPassword={showPassword}
            intent={intent}
            otpRequired={otpRequired}
            otp={otp}
            onGoogleSignIn={handleGoogleSignIn}
            onEmailAuth={handleEmailAuth}
            onOtpVerify={handleOtpVerify}
            onEmailChange={setEmail}
            onNameChange={setName}
            onPasswordChange={setPassword}
            onToggleShowPassword={() => setShowPassword((v) => !v)}
            onIntentToggle={() => { setIntent((v) => v === "sign-in" ? "sign-up" : "sign-in"); setAuthError(null) }}
            onOtpChange={setOtp}
            onSkip={next}
          />
        )}
        {step === 3 && <StepShortcuts onNext={next} />}
        {step === 4 && <StepPin onOpenRelay={handleOpenRelay} />}
      </div>

      <div className={styles.dots}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <button
            key={i}
            className={`${styles.dot} ${i === step ? styles.dotActive : styles.dotInactive}`}
            onClick={() => goTo(i)}
            aria-label={`Step ${i + 1}`}
          />
        ))}
      </div>
    </div>
  )
}

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className={styles.welcomeBg}>
        <MarqueeRow icons={ROW1_ICONS} />
        <MarqueeRow icons={ROW2_ICONS} reverse />
        <MarqueeRow icons={ROW3_ICONS} />
        <div className={styles.welcomeOverlay} />
      </div>

      <div className={styles.welcomeContent}>
        <div className={styles.relayLogoWrap}>
          <img src="/icon.png" alt="Relay" width={72} height={72} className={styles.relayLogo} />
        </div>
        <h1 className={styles.welcomeHeading}>
          Welcome to Relay
        </h1>
        <p className={styles.welcomeSub}>
          Stop re-explaining yourself to every AI. Relay keeps your project context synced across all your AI chats and IDE agents.
        </p>
        <button className={styles.primaryBtn} onClick={onNext}>
          Get started →
        </button>
      </div>
    </>
  )
}

function StepFeatures({ onNext }: { onNext: () => void }) {
  function openYouTube() {
    chrome.tabs.create({ url: "https://youtu.be/15aqzManX-0" }).catch(() => {
      window.open("https://youtu.be/15aqzManX-0", "_blank")
    })
  }

  return (
    <div className={styles.featuresStep}>
      <div className={styles.launchCard} onClick={openYouTube} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openYouTube()}>
        <img
          src={`${BASE_URL}/images/video-posters/relay-launch.webp`}
          alt="Watch the Relay launch video"
          className={styles.launchPoster}
        />
        <div className={styles.launchPlayBtn}>
          <svg width="16" height="18" viewBox="0 0 16 18" fill="white">
            <path d="M1 1l14 8-14 8V1z" />
          </svg>
        </div>
        <div className={styles.launchLabel}>Watch the launch video</div>
      </div>

      <div className={styles.featuresGrid}>
        {FEATURES.map((f) => (
          <FeatureCard key={f.label} label={f.label} title={f.title} desc={f.desc} video={f.video} poster={f.poster} />
        ))}
      </div>

      <button className={styles.primaryBtn} onClick={onNext} style={{ marginTop: 20 }}>
        Next →
      </button>
    </div>
  )
}

function StepAuth({
  authBusy, authError, email, name, password, showPassword,
  intent, otpRequired, otp,
  onGoogleSignIn, onEmailAuth, onOtpVerify,
  onEmailChange, onNameChange, onPasswordChange, onToggleShowPassword,
  onIntentToggle, onOtpChange, onSkip,
}: {
  authBusy: boolean; authError: string | null; email: string; name: string
  password: string; showPassword: boolean; intent: "sign-in" | "sign-up"
  otpRequired: boolean; otp: string
  onGoogleSignIn: () => void; onEmailAuth: () => void; onOtpVerify: () => void
  onEmailChange: (v: string) => void; onNameChange: (v: string) => void
  onPasswordChange: (v: string) => void; onToggleShowPassword: () => void
  onIntentToggle: () => void; onOtpChange: (v: string) => void; onSkip: () => void
}) {
  const isSignUp = intent === "sign-up"

  return (
    <div className={styles.authStep}>
      <h1 className={styles.heading} style={{ fontSize: 32, marginBottom: 8 }}>
        {isSignUp
          ? <>Create your <span className={styles.headingAccent}>account</span></>
          : <>Sign in to <span className={styles.headingAccent}>continue</span></>
        }
      </h1>
      <p className={styles.subheading} style={{ marginBottom: 32 }}>
        Your context syncs instantly across all AI tools.
      </p>

      <div className={styles.authForm}>
        {otpRequired ? (
          <>
            <p className={styles.otpHint}>{authError ?? "Enter the verification code sent to your email."}</p>
            <input
              className={styles.authInput}
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              value={otp}
              onChange={(e) => onOtpChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void onOtpVerify() }}
              autoFocus
              maxLength={6}
            />
            <button className={styles.primaryBtn} style={{ width: "100%" }} onClick={onOtpVerify} disabled={authBusy || !otp.trim()}>
              {authBusy ? "Verifying…" : "Verify code"}
            </button>
          </>
        ) : (
          <>
            <button className={styles.googleBtn} onClick={onGoogleSignIn} disabled={authBusy}>
              <GoogleLogo />
              {authBusy ? "Signing in…" : isSignUp ? "Sign up with Google" : "Continue with Google"}
            </button>

            <div className={styles.authDivider}><span>or</span></div>

            {isSignUp && (
              <input
                className={styles.authInput}
                type="text"
                placeholder="Full name"
                value={name}
                onChange={(e) => onNameChange(e.target.value)}
                autoComplete="name"
              />
            )}

            <input
              className={styles.authInput}
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => onEmailChange(e.target.value)}
              autoComplete="email"
            />

            <div className={styles.passwordWrap}>
              <input
                className={styles.authInput}
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={password}
                onChange={(e) => onPasswordChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void onEmailAuth() }}
                autoComplete={isSignUp ? "new-password" : "current-password"}
              />
              <button className={styles.eyeBtn} onClick={onToggleShowPassword} type="button" tabIndex={-1}>
                <EyeIcon open={showPassword} />
              </button>
            </div>

            <button
              className={styles.primaryBtn}
              style={{ width: "100%" }}
              onClick={onEmailAuth}
              disabled={authBusy || !email.trim() || !password.trim()}
            >
              {authBusy ? (isSignUp ? "Creating…" : "Signing in…") : isSignUp ? "Create account" : "Sign in"}
            </button>

            <button className={styles.toggleIntent} onClick={onIntentToggle} type="button">
              {isSignUp ? "Already have an account? Sign in →" : "Don't have an account? Sign up →"}
            </button>

            {authError && !otpRequired && <p className={styles.authError}>{authError}</p>}
          </>
        )}
      </div>

      <button className={styles.skipLink} onClick={onSkip} style={{ marginTop: 16 }}>
        Skip for now
      </button>
    </div>
  )
}

function StepShortcuts({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.shortcutsStep}>
      <h1 className={styles.heading} style={{ fontSize: 32, marginBottom: 8 }}>
        Two shortcuts to know
      </h1>
      <p className={styles.subheading} style={{ marginBottom: 40 }}>
        Relay works best from the keyboard — no clicking around.
      </p>

      <div className={styles.shortcutsGrid}>
        <div className={styles.shortcutCard}>
          <div className={styles.shortcutKeys}>
            <KbdKey wide>{modKey}</KbdKey>
            <KbdKey wide>Shift</KbdKey>
            <KbdKey>I</KbdKey>
          </div>
          <p className={styles.shortcutCardTitle}>Insert project brief</p>
          <p className={styles.shortcutCardDesc}>Injects your full project context into any AI chat instantly</p>
        </div>

        <div className={styles.shortcutCard}>
          <div className={styles.shortcutKeys}>
            <KbdKey wide>{altKey}</KbdKey>
            <KbdKey wide>Shift</KbdKey>
            <KbdKey>S</KbdKey>
          </div>
          <p className={styles.shortcutCardTitle}>Open Relay sidebar</p>
          <p className={styles.shortcutCardDesc}>Toggle the Relay panel from anywhere in your browser</p>
        </div>
      </div>

      <button className={styles.primaryBtn} onClick={onNext} style={{ marginTop: 40 }}>
        Next →
      </button>
    </div>
  )
}

function openX() {
  chrome.tabs.create({ url: "https://x.com/alimmka_" }).catch(() => window.open("https://x.com/alimmka_", "_blank"))
}

function StepPin({ onOpenRelay }: { onOpenRelay: () => void }) {
  return (
    <div className={styles.pinStep}>
      <h1 className={styles.pinHeading}>
        You're <span className={styles.headingAccent}>good to go</span>
      </h1>
      <p className={styles.subheading} style={{ marginBottom: 28 }}>
        Relay is installed and ready to use.
      </p>

      <div className={styles.pinCard}>
        <div className={styles.pinRow}>
          <div className={styles.pinRowText}>
            <p className={styles.pinRowTitle}>Meet the founder</p>
            <p className={styles.pinRowDesc}>Follow the journey of building Relay</p>
          </div>
          <button className={styles.xBtn} onClick={openX}>
            <XLogo />
            @alimmka_
          </button>
        </div>

        <div className={styles.pinRowDivider} />

        <div className={styles.pinExtRow}>
          <div className={styles.pinExtLeft}>
            <div className={styles.puzzleIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19.439 7.85c-.049.322.059.648.289.878l1.568 1.568c.47.47.47 1.234 0 1.704l-1.704 1.704a.999.999 0 0 1-.848.287c-.31-.05-.611.102-.784.352l-.65.923a.998.998 0 0 0 .158 1.306l.123.099a1 1 0 0 1-.307 1.699l-2.422.808a1 1 0 0 1-1.263-.616L13.5 17H11l-.389 1.563a1 1 0 0 1-1.263.616l-2.421-.808a1 1 0 0 1-.308-1.699l.046-.036a1 1 0 0 0 .152-1.41l-.65-.924a1 1 0 0 0-.784-.352 1 1 0 0 1-.848-.287l-1.704-1.704a1.202 1.202 0 0 1 0-1.704l1.568-1.568a1 1 0 0 0 .29-.878l-.238-1.43A1 1 0 0 1 6.68 5H8V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v1h1.32a1 1 0 0 1 .98 1.21l-.238 1.43z" />
              </svg>
            </div>
            <div>
              <p className={styles.pinRowTitle}>Pin Relay</p>
              <p className={styles.pinRowDesc}>Click the puzzle icon in your browser toolbar and pin Relay to keep it always visible.</p>
            </div>
          </div>

          <div className={styles.browserMini}>
            <div className={styles.browserMiniChrome}>
              <span className={styles.tlR} /><span className={styles.tlY} /><span className={styles.tlG} />
              <div className={styles.miniAddrBar}>onrelay.app</div>
              <div className={styles.miniPuzzle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)" stroke="none">
                  <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z" />
                </svg>
              </div>
            </div>
            <div className={styles.miniDropdown}>
              <div className={styles.miniDropHeader}>Extensions</div>
              <div className={styles.miniDropItem}>
                <img src="/icon.png" alt="Relay" width={16} height={16} style={{ borderRadius: 3 }} />
                <span className={styles.miniDropName}>Relay</span>
                <span className={styles.miniPinIcon}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="#10b981">
                    <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z" />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button className={styles.openRelayBtn} onClick={onOpenRelay}>
        Open Relay →
      </button>
    </div>
  )
}
