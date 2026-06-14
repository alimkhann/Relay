import { useState, useEffect, useRef } from "react"
import relayIconUrl from "../../../assets/icon.png"
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
import {
  ONBOARDING_SOURCES,
  PERSONA_OPTIONS,
  type OnboardingPersonaKind,
} from "@relay/shared/constants/onboarding"

import { getRelaySession } from "../../storage/session"
import { relayFetch } from "../../utils/api"
import { PaywallCards } from "../paywall-cards"
import {
  TOTAL_STEPS,
  STEP_CREATE_PROJECT,
  STEP_PERSONA,
  STEP_VIDEOS,
  STEP_PAYWALL,
  STEP_SHORTCUTS,
  STEP_PIN,
  resolveOnboardingStep,
} from "./steps"
import styles from "./OnboardingFlow.module.css"

const BASE_URL = "https://onrelay.app"
const STEP_KEY = "relay.onboarding.htmlStep"
const META_KEY = "relay.onboarding.htmlMeta"

const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac")
const altKey = isMac ? "⌥" : "Alt"

function normalizeUrl(url: string): string {
  const trimmed = url.trim()
  if (!trimmed) return ""
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

// ── Feature & walkthrough data ────────────────────────────────────────────────

const FEATURES = [
  { icon: <ZapIcon />,      label: "AUTO-CAPTURE",       title: "Quietly saves what matters from every AI chat",     desc: "Work in ChatGPT, Claude, or Gemini. Relay captures decisions, tasks, and constraints automatically.", video: `${BASE_URL}/videos/auto-capture.mp4`,       poster: `${BASE_URL}/images/video-posters/auto-capture.webp` },
  { icon: <FileTextIcon />, label: "PROJECT BRIEFS",      title: "One-click context restoration in fresh chats",     desc: "Your project brief updates itself as you work. Inject the full context instantly.",                   video: `${BASE_URL}/videos/project-briefs.mp4`,     poster: `${BASE_URL}/images/video-posters/project-briefs.webp` },
  { icon: <TerminalIcon />, label: "MCP INTEGRATION",     title: "Your coding agent reads and writes project memory", desc: "Claude Code, Cursor, and any MCP-compatible agent connect directly to the same brief. Run: npx @onrelay/wizard",               video: `${BASE_URL}/videos/mcp-integration.mp4`,   poster: `${BASE_URL}/images/video-posters/mcp-integration.webp` },
  { icon: <ArrowsIcon />,   label: "CROSS-SURFACE SYNC",  title: "Decisions flow between tools automatically",        desc: "A choice made in ChatGPT surfaces in Cursor. Constraints stay in sync across every session.",         video: `${BASE_URL}/videos/cross-surface-sync.mp4`, poster: `${BASE_URL}/images/video-posters/cross-surface-sync.webp` },
]

const WALKTHROUGH_STEPS = [
  { title: "Auto-capture",            body: "Open any AI chat. With auto-capture on, Relay captures decisions and tasks as you work — no copy-pasting.", video: { mp4: `${BASE_URL}/videos/auto-capture.mp4`,     poster: `${BASE_URL}/images/video-posters/auto-capture.webp` } },
  { title: "Insert brief",            body: "In any AI chat, click Insert Brief in the panel. Relay injects your full project context instantly.",        video: { mp4: `${BASE_URL}/videos/project-briefs.mp4`,  poster: `${BASE_URL}/images/video-posters/project-briefs.webp` } },
  { title: "MCP for coding agents",   body: "Connect Relay's MCP server so your IDE agent (Cursor, Claude Code) reads and writes live project context. Run: npx @onrelay/wizard", video: { mp4: `${BASE_URL}/videos/mcp-integration.mp4`, poster: `${BASE_URL}/images/video-posters/mcp-integration.webp` } },
  { title: "Manage on the dashboard", body: "The dashboard is where you manage memories, briefs, captures, and settings — everything in one place.",     image: { src: `${BASE_URL}/images/dashboard.webp`, alt: "Relay dashboard" }, cta: { href: `${BASE_URL}/dashboard`, label: "Open dashboard →" } },
]

// ── Inline icons ──────────────────────────────────────────────────────────────

function ZapIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg> }
function FileTextIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg> }
function TerminalIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg> }
function ArrowsIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 21 7 17 3"/><line x1="21" y1="7" x2="3" y2="7"/><polyline points="7 21 3 17 7 13"/><line x1="3" y1="17" x2="21" y2="17"/></svg> }
function GoogleLogo() {
  return <svg width="18" height="18" viewBox="0 0 18 18"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.258c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.707A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.707V4.961H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.039l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.96L3.964 7.293C4.672 5.163 6.656 3.58 9 3.58z"/></svg>
}
function XLogo() { return <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.746l7.73-8.835L1.254 2.25H8.08l4.259 5.632 5.905-5.632Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77z"/></svg> }
function EyeIcon({ open }: { open: boolean }) {
  return open
    ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
    : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
}
function PlayIcon() { return <svg width="14" height="16" viewBox="0 0 14 16" fill="white"><path d="M1 1l12 7-12 7V1z"/></svg> }
function PlayIconSm() { return <svg width="11" height="13" viewBox="0 0 11 13" fill="white"><path d="M1 1l9 5.5-9 5.5V1z"/></svg> }

// ── Marquee rows ──────────────────────────────────────────────────────────────

const ROW1 = [OpenAI, Claude, Gemini, Grok, Perplexity, DeepSeek]
const ROW2 = [ClaudeCode, Cursor, Codex, Antigravity, Windsurf, GithubCopilot]
const ROW3 = [Grok, DeepSeek, ClaudeCode, OpenAI, Windsurf, Gemini]

function MarqueeRow({ icons, reverse }: { icons: typeof ROW1; reverse?: boolean }) {
  const quad = [...icons, ...icons, ...icons]
  return (
    <div className={styles.marqueeRow}>
      <div className={`${styles.marqueeTrack} ${reverse ? styles.marqueeReverse : ""}`}>
        {quad.map((Icon, i) => (
          <div key={i} className={styles.bgIconCell}><Icon.Avatar size={60} /></div>
        ))}
      </div>
    </div>
  )
}

// ── Video Modal ───────────────────────────────────────────────────────────────

function VideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") onClose() }
    document.addEventListener("keydown", fn)
    return () => document.removeEventListener("keydown", fn)
  }, [onClose])
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <button className={styles.modalClose} onClick={onClose}>✕</button>
        <video src={url} autoPlay controls className={styles.modalVideo} />
      </div>
    </div>
  )
}

// ── OTP cells ─────────────────────────────────────────────────────────────────

function OtpCells({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [cells, setCells] = useState<string[]>(() => {
    const a = value.split("").slice(0, 6); while (a.length < 6) a.push(""); return a
  })
  const refs = useRef<Array<HTMLInputElement | null>>([])

  useEffect(() => {
    const a = value.split("").slice(0, 6); while (a.length < 6) a.push("")
    setCells(a)
  }, [value])

  function update(next: string[]) { setCells(next); onChange(next.join("")) }

  function handleChange(i: number, raw: string) {
    const d = raw.replace(/\D/g, "").slice(-1)
    const n = [...cells]; n[i] = d; update(n)
    if (d && i < 5) refs.current[i + 1]?.focus()
  }

  function handleKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (cells[i] === "" && i > 0) { const n = [...cells]; n[i - 1] = ""; update(n); refs.current[i - 1]?.focus() }
      else { const n = [...cells]; n[i] = ""; update(n) }
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    e.preventDefault()
    const p = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6)
    if (!p) return
    const n = p.split(""); while (n.length < 6) n.push(""); update(n)
    refs.current[Math.min(p.length, 5)]?.focus()
  }

  return (
    <div className={styles.otpCells}>
      {cells.map((cell, i) => (
        <input key={i} ref={(el) => { refs.current[i] = el }} className={styles.otpCell}
          type="text" inputMode="numeric" pattern="[0-9]" maxLength={1} value={cell}
          autoComplete={i === 0 ? "one-time-code" : "off"} autoFocus={i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)} onPaste={handlePaste} />
      ))}
    </div>
  )
}

function KbdKey({ children, wide }: { children: React.ReactNode; wide?: boolean }) {
  return <span className={`${styles.kbdKey} ${wide ? styles.kbdKeyWide : ""}`}>{children}</span>
}

// ── Helper: navigate to step (direct, bypasses goTo guard) ────────────────────

function navTo(step: number, setStep: (n: number) => void, setVisible: (v: boolean) => void) {
  setVisible(false)
  setTimeout(() => {
    setStep(step)
    chrome.storage.local.set({
      [STEP_KEY]: step,
      [META_KEY]: {
        step,
        updatedAt: new Date().toISOString(),
        source: "html",
      },
    })
    setVisible(true)
  }, 220)
}

function hasCompletedOnboarding(session: Record<string, unknown>) {
  const onboarding = session.onboarding as { status?: string } | undefined
  const projectOptions = session.projectOptions
  const projects = session.projects
  return (
    onboarding?.status === "completed" ||
    (Array.isArray(projectOptions) && projectOptions.length > 0) ||
    (Array.isArray(projects) && projects.length > 0)
  )
}

// ── Main flow ─────────────────────────────────────────────────────────────────

export function OnboardingFlow() {
  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [isSignedIn, setIsSignedIn] = useState(false)
  const [canUseSetupFlow, setCanUseSetupFlow] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)
  const [email, setEmail] = useState("")
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [intent, setIntent] = useState<"sign-in" | "sign-up">("sign-in")
  const [otpRequired, setOtpRequired] = useState(false)
  const [otp, setOtp] = useState("")
  const [projectName, setProjectName] = useState("")
  const [projectDesc, setProjectDesc] = useState("")
  const [scanUrl, setScanUrl] = useState("")
  const [scanBusy, setScanBusy] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  const [projectBusy, setProjectBusy] = useState(false)
  const [projectError, setProjectError] = useState<string | null>(null)
  const [modalVideo, setModalVideo] = useState<string | null>(null)
  const [referralCode, setReferralCode] = useState("")
  // Skip-state: persona/videos may already be done in the dashboard onboarding.
  const [personaSet, setPersonaSet] = useState(false)
  const [videosSeen, setVideosSeen] = useState(false)
  const [personaKind, setPersonaKind] = useState<OnboardingPersonaKind | null>(null)
  const [personaSources, setPersonaSources] = useState<string[]>([])
  const [personaBusy, setPersonaBusy] = useState(false)

  useEffect(() => {
    document.title = "Welcome to Relay — Let's Get Started"
    let cancelled = false
    const savedStep = new Promise<number | null>((resolve) => {
      chrome.storage.local.get([STEP_KEY], (result: Record<string, unknown>) => {
        const saved = result[STEP_KEY]
        resolve(typeof saved === "number" && saved >= 0 && saved < TOTAL_STEPS ? saved : null)
      })
    })
    void Promise.all([getRelaySession(), savedStep]).then(async ([session, saved]) => {
      if (cancelled) return
      const canSetup = session.connected && !hasCompletedOnboarding(session as unknown as Record<string, unknown>)
      setIsSignedIn(session.connected)
      setCanUseSetupFlow(canSetup)
      const skip = session.connected
        ? await loadSkipState()
        : { personaSet: false, videosSeen: false }
      if (cancelled) return
      if (saved !== null) {
        let restored = Math.min(saved, TOTAL_STEPS - 1)
        // Signed in but parked on/before auth → advance into the first
        // applicable setup step.
        if (session.connected && restored <= 2) {
          restored = resolveOnboardingStep(STEP_CREATE_PROJECT, {
            canSetup,
            personaSet: skip.personaSet,
            videosSeen: skip.videosSeen,
          })
        }
        setStep(restored)
        if (restored !== saved) chrome.storage.local.set({ [STEP_KEY]: restored })
      }
    })
    setTimeout(() => setVisible(true), 50)
    return () => { cancelled = true }
  }, [])

  function goTo(target: number) {
    navTo(
      resolveOnboardingStep(target, { canSetup: canUseSetupFlow, personaSet, videosSeen }),
      setStep,
      setVisible,
    )
  }
  function next() { goTo(step + 1) }

  // Persona/videos may already be done in the dashboard; load that so we can
  // skip those steps here.
  async function loadSkipState(): Promise<{ personaSet: boolean; videosSeen: boolean }> {
    try {
      const res = await relayFetch("/api/settings")
      if (!res.ok) return { personaSet: false, videosSeen: false }
      const data = (await res.json()) as {
        settings?: { persona?: unknown; walkthrough?: { dismissedAt?: string | null } | null }
      }
      const hasPersona = Boolean(data.settings?.persona)
      const hasVideos = Boolean(data.settings?.walkthrough?.dismissedAt)
      if (hasPersona) setPersonaSet(true)
      if (hasVideos) setVideosSeen(true)
      return { personaSet: hasPersona, videosSeen: hasVideos }
    } catch {
      return { personaSet: false, videosSeen: false }
    }
  }

  async function commitPersona() {
    if (!personaKind || personaSources.length === 0) { goTo(STEP_VIDEOS); return }
    setPersonaBusy(true)
    try {
      await relayFetch("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({ persona: { kind: personaKind, contextSources: personaSources } }),
      })
      setPersonaSet(true)
    } catch { /* best-effort */ }
    finally { setPersonaBusy(false) }
    goTo(STEP_VIDEOS)
  }

  async function dismissWalkthrough() {
    try { await relayFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ walkthrough: { dismissedAt: new Date().toISOString() } }) }) }
    catch { /* best-effort */ }
  }

  async function getSessionData() {
    return getRelaySession() as Promise<unknown> as Promise<Record<string, unknown>>
  }

  async function afterAuth() {
    setIsSignedIn(true)
    const stored = await getSessionData()
    const needsProjectSetup = !hasCompletedOnboarding(stored)
    setCanUseSetupFlow(needsProjectSetup)
    const skip = await loadSkipState()
    // Resolve from fresh values (setState is async), starting at CreateProject.
    const target = resolveOnboardingStep(STEP_CREATE_PROJECT, {
      canSetup: needsProjectSetup,
      personaSet: skip.personaSet,
      videosSeen: skip.videosSeen,
    })
    navTo(target, setStep, setVisible)
  }

  async function handleGoogleSignIn() {
    setAuthBusy(true); setAuthError(null)
    try {
      const deviceName = isMac ? "Relay on Mac" : "Relay on browser"
      const result = await chrome.runtime.sendMessage({ type: "RELAY_GOOGLE_SIGN_IN", payload: { deviceName } }) as { ok: boolean; reason?: string } | undefined
      if (result?.ok) {
        if (intent === "sign-up" && referralCode.trim()) {
          await relayFetch("/api/referral", { method: "POST", body: JSON.stringify({ code: referralCode.trim() }) }).catch(() => {})
        }
        await afterAuth()
      } else {
        setAuthError(result?.reason ?? "Sign-in failed. Try again.")
      }
    } catch { setAuthError("Sign-in failed. Try again.") }
    finally { setAuthBusy(false) }
  }

  async function handleEmailAuth() {
    if (!email.trim() || !password.trim()) return
    setAuthBusy(true); setAuthError(null)
    try {
      const deviceName = isMac ? "Relay on Mac" : "Relay on browser"
      const result = await chrome.runtime.sendMessage({
        type: "RELAY_EMAIL_SIGN_IN",
        payload: { email: email.trim(), password, intent, name: intent === "sign-up" && name.trim() ? name.trim() : undefined, deviceName },
      }) as { ok: boolean; requiresOtp?: boolean; reason?: string } | undefined
      if (result?.ok && result.requiresOtp) {
        setOtpRequired(true)
      } else if (result?.ok) {
        if (intent === "sign-up" && referralCode.trim()) {
          await relayFetch("/api/referral", { method: "POST", body: JSON.stringify({ code: referralCode.trim() }) }).catch(() => {})
        }
        await afterAuth()
      } else {
        setAuthError(result?.reason ?? "Sign-in failed. Try again.")
      }
    } catch { setAuthError("Sign-in failed. Try again.") }
    finally { setAuthBusy(false) }
  }

  async function handleOtpVerify() {
    if (otp.length < 6) return
    setAuthBusy(true); setAuthError(null)
    try {
      const deviceName = isMac ? "Relay on Mac" : "Relay on browser"
      const result = await chrome.runtime.sendMessage({
        type: "RELAY_EMAIL_SIGN_IN",
        payload: { email: email.trim(), password, intent, otp: otp.trim(), deviceName },
      }) as { ok: boolean; reason?: string } | undefined
      if (result?.ok) {
        if (referralCode.trim()) {
          await relayFetch("/api/referral", { method: "POST", body: JSON.stringify({ code: referralCode.trim() }) }).catch(() => {})
        }
        await afterAuth()
      } else {
        setAuthError(result?.reason ?? "Invalid code. Try again.")
      }
    } catch { setAuthError("Verification failed. Try again.") }
    finally { setAuthBusy(false) }
  }

  async function handleScanUrl() {
    const url = normalizeUrl(scanUrl)
    if (!url) return
    setScanBusy(true); setScanError(null)
    try {
      const result = await chrome.runtime.sendMessage({ type: "RELAY_SCAN_PROJECT_URL", payload: { url } }) as { ok: boolean; result?: { name: string | null; description: string | null }; reason?: string } | undefined
      if (result?.ok && result.result) {
        if (result.result.name) setProjectName(result.result.name)
        if (result.result.description) setProjectDesc(result.result.description)
      } else {
        setScanError(result?.reason ?? "Scan failed. Check the URL.")
      }
    } catch { setScanError("Scan failed.") }
    finally { setScanBusy(false) }
  }

  async function handleCreateProject() {
    if (!projectName.trim()) return
    setProjectBusy(true); setProjectError(null)
    try {
      const result = await chrome.runtime.sendMessage({
        type: "RELAY_CREATE_PROJECT",
        payload: {
          name: projectName.trim(),
          description: projectDesc.trim() || undefined,
          projectUrl: normalizeUrl(scanUrl) || undefined,
        },
      }) as { ok: boolean; reason?: string } | undefined
      if (result?.ok) { goTo(STEP_PERSONA) }
      else setProjectError(result?.reason ?? "Could not create project. Try again.")
    } catch { setProjectError("Could not create project. Try again.") }
    finally { setProjectBusy(false) }
  }

  async function handleOpenRelay() {
    if (isSignedIn) await dismissWalkthrough()
    chrome.storage.local.remove([STEP_KEY, META_KEY])
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
      {step === 0 ? (
        <div className={`${styles.welcomeRoot} ${stepClass}`}>
          <StepWelcome onNext={next} />
        </div>
      ) : (
        <div className={`${styles.step} ${stepClass} ${step >= 2 ? styles.stepCarded : ""}`}>
          {step === 1 && <StepFeatures onOpenVideo={setModalVideo} />}
          {step === 2 && (
            <StepAuth
              authBusy={authBusy} authError={authError} email={email} name={name}
              password={password} showPassword={showPassword} intent={intent}
              otpRequired={otpRequired} otp={otp}
              referralCode={referralCode}
              onGoogleSignIn={handleGoogleSignIn} onEmailAuth={handleEmailAuth} onOtpVerify={handleOtpVerify}
              onEmailChange={setEmail} onNameChange={setName} onPasswordChange={setPassword}
              onToggleShowPassword={() => setShowPassword((v) => !v)}
              onIntentToggle={() => { setIntent((v) => v === "sign-in" ? "sign-up" : "sign-in"); setAuthError(null); setOtpRequired(false); setOtp(""); setReferralCode("") }}
              onOtpChange={setOtp}
              onReferralCodeChange={setReferralCode}
              onSkip={() => navTo(STEP_SHORTCUTS, setStep, setVisible)}
            />
          )}
          {step === 3 && (
            <StepCreateProject
              projectName={projectName} projectDesc={projectDesc}
              scanUrl={scanUrl} scanBusy={scanBusy} scanError={scanError}
              projectBusy={projectBusy} projectError={projectError}
              onNameChange={setProjectName} onDescChange={setProjectDesc}
              onScanUrlChange={setScanUrl} onScan={handleScanUrl}
              onCreate={handleCreateProject}
              onSkip={() => goTo(STEP_PERSONA)}
            />
          )}
          {step === STEP_PERSONA && (
            <StepPersona
              personaKind={personaKind}
              personaSources={personaSources}
              busy={personaBusy}
              onChooseKind={(kind) => { setPersonaKind(kind); setPersonaSources([]) }}
              onToggleSource={(source) =>
                setPersonaSources((prev) =>
                  prev.includes(source) ? prev.filter((s) => s !== source) : [...prev, source],
                )
              }
              onContinue={() => void commitPersona()}
              onSkip={() => goTo(STEP_VIDEOS)}
            />
          )}
          {step === STEP_VIDEOS && <StepWalkthrough onNext={() => goTo(STEP_PAYWALL)} />}
          {step === STEP_PAYWALL && (
            <div className={styles.paywallStep}>
              <h1 className={styles.heading} style={{ fontSize: 30, marginBottom: 6 }}>Choose your plan</h1>
              <p className={styles.subheading} style={{ marginBottom: 28 }}>
                Start free, or unlock long-term memory and higher limits.
              </p>
              <PaywallCards onContinueFree={() => goTo(STEP_SHORTCUTS)} />
            </div>
          )}
          {step === STEP_SHORTCUTS && <StepShortcuts onNext={next} />}
          {step === STEP_PIN && <StepPin isSignedIn={isSignedIn} onOpenRelay={handleOpenRelay} />}
        </div>
      )}

      {step === 1 && (
        <button
          className={`${styles.primaryBtn} ${styles.featuresFixedNext}`}
          style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}
          onClick={next}
        >
          Next →
        </button>
      )}

      <div className={styles.dots}>
        {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
          <button key={i} className={`${styles.dot} ${i === step ? styles.dotActive : styles.dotInactive}`}
            onClick={() => goTo(i)} aria-label={`Step ${i + 1}`} />
        ))}
      </div>

      {modalVideo && <VideoModal url={modalVideo} onClose={() => setModalVideo(null)} />}
    </div>
  )
}

// ── Step 0: Welcome ───────────────────────────────────────────────────────────

function StepWelcome({ onNext }: { onNext: () => void }) {
  return (
    <>
      <div className={styles.iconTheater}>
        <div className={styles.marqueeWrap}>
          <MarqueeRow icons={ROW1} />
          <MarqueeRow icons={ROW2} reverse />
          <MarqueeRow icons={ROW3} />
        </div>
        <div className={styles.theaterGlow} />
        <div className={styles.relayLogoWrap}>
          <img src={relayIconUrl} alt="Relay" width={100} height={100} className={styles.relayLogo} />
        </div>
      </div>
      <div className={styles.welcomeText}>
        <h1 className={styles.welcomeHeading}>Welcome to Relay</h1>
        <p className={styles.welcomeSub}>
          Stop re-explaining yourself to every AI. Relay keeps your project context synced across all your AI chats and IDE agents.
        </p>
        <button className={styles.primaryBtn} onClick={onNext}>Get started →</button>
      </div>
    </>
  )
}

// ── Step 1: Features ──────────────────────────────────────────────────────────

function FeatureCard({ icon, label, title, desc, video, poster, onOpen }: {
  icon: React.ReactNode; label: string; title: string; desc: string
  video: string; poster: string; onOpen: (url: string) => void
}) {
  const ref = useRef<HTMLVideoElement>(null)
  return (
    <div className={styles.featureCard}
      onMouseEnter={() => { if (ref.current) { ref.current.currentTime = 0; void ref.current.play() } }}
      onMouseLeave={() => { if (ref.current) ref.current.pause() }}
      onClick={() => onOpen(video)} role="button" tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && onOpen(video)}>
      <div className={styles.featureMedia}>
        <video ref={ref} src={video} poster={poster} muted playsInline loop preload="metadata" />
        <div className={styles.featurePlayOverlay}>
          <div className={styles.featurePlayCircle}><PlayIconSm /></div>
        </div>
      </div>
      <div className={styles.featureBody}>
        <div className={styles.featureLabelRow}>
          <span className={styles.featureIcon}>{icon}</span>
          <span className={styles.featureLabel}>{label}</span>
        </div>
        <p className={styles.featureTitle}>{title}</p>
        <p className={styles.featureDesc}>{desc}</p>
      </div>
    </div>
  )
}

function StepFeatures({ onOpenVideo }: { onOpenVideo: (url: string) => void }) {
  const launchRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (launchRef.current) void launchRef.current.play().catch(() => {})
  }, [])

  function openYouTube() {
    chrome.tabs.create({ url: "https://youtu.be/15aqzManX-0" }).catch(() => window.open("https://youtu.be/15aqzManX-0", "_blank"))
  }

  return (
    <div className={styles.featuresStep}>
      <div className={styles.launchCard} onClick={openYouTube} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && openYouTube()}>
        <video ref={launchRef} src={`${BASE_URL}/videos/relay-launch-preview.mp4`} poster={`${BASE_URL}/images/video-posters/relay-launch.webp`} muted playsInline loop className={styles.launchPoster} />
        <div className={styles.launchGradient} />
        <div className={styles.launchPlayBtn}><PlayIcon /></div>
        <div className={styles.launchLabel}>Watch the launch video</div>
      </div>

      <div className={styles.featuresGrid}>
        {FEATURES.map((f) => (
          <FeatureCard key={f.label} icon={f.icon} label={f.label} title={f.title} desc={f.desc} video={f.video} poster={f.poster} onOpen={onOpenVideo} />
        ))}
      </div>

    </div>
  )
}

// ── Step 2: Auth ──────────────────────────────────────────────────────────────

function StepAuth({
  authBusy, authError, email, name, password, showPassword, intent, otpRequired, otp,
  referralCode,
  onGoogleSignIn, onEmailAuth, onOtpVerify, onEmailChange, onNameChange, onPasswordChange,
  onToggleShowPassword, onIntentToggle, onOtpChange, onReferralCodeChange, onSkip,
}: {
  authBusy: boolean; authError: string | null; email: string; name: string
  password: string; showPassword: boolean; intent: "sign-in" | "sign-up"
  otpRequired: boolean; otp: string; referralCode: string
  onGoogleSignIn: () => void; onEmailAuth: () => void; onOtpVerify: () => void
  onEmailChange: (v: string) => void; onNameChange: (v: string) => void
  onPasswordChange: (v: string) => void; onToggleShowPassword: () => void
  onIntentToggle: () => void; onOtpChange: (v: string) => void
  onReferralCodeChange: (v: string) => void; onSkip: () => void
}) {
  const isSignUp = intent === "sign-up"
  return (
    <div className={styles.authStep}>
      <h1 className={styles.heading} style={{ fontSize: 32, marginBottom: 8 }}>
        {isSignUp ? "Create your account" : "Sign in to continue"}
      </h1>
      <p className={styles.subheading} style={{ marginBottom: 32 }}>
        Your context syncs instantly across all AI tools.
      </p>

      <div className={styles.authForm}>
        {otpRequired ? (
          <>
            <OtpCells value={otp} onChange={onOtpChange} />
            <button className={styles.primaryBtn} style={{ width: "100%" }} onClick={onOtpVerify} disabled={authBusy || otp.length < 6}>
              {authBusy ? "Verifying…" : "Verify email"}
            </button>
            {authError && <p className={styles.authError}>{authError}</p>}
          </>
        ) : (
          <>
            <button className={styles.googleBtn} onClick={onGoogleSignIn} disabled={authBusy}>
              <GoogleLogo />
              {isSignUp ? "Sign up with Google" : "Continue with Google"}
            </button>
            <div className={styles.authDivider}><span>or</span></div>
            {isSignUp && (
              <input className={styles.authInput} type="text" placeholder="Full name" value={name}
                onChange={(e) => onNameChange(e.target.value)} autoComplete="name" />
            )}
            <input className={styles.authInput} type="email" placeholder="Email" value={email}
              onChange={(e) => onEmailChange(e.target.value)} autoComplete="email" />
            <div className={styles.passwordWrap}>
              <input className={styles.authInput} type={showPassword ? "text" : "password"} placeholder="Password"
                value={password} onChange={(e) => onPasswordChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void onEmailAuth() }}
                autoComplete={isSignUp ? "new-password" : "current-password"} />
              <button className={styles.eyeBtn} onClick={onToggleShowPassword} type="button" tabIndex={-1}>
                <EyeIcon open={showPassword} />
              </button>
            </div>
            {isSignUp && (
              <input className={styles.authInput} type="text" placeholder="Referral code (optional)"
                value={referralCode} onChange={(e) => onReferralCodeChange(e.target.value)}
                autoComplete="off" />
            )}
            <button className={styles.primaryBtn} style={{ width: "100%" }} onClick={onEmailAuth}
              disabled={authBusy || !email.trim() || !password.trim()}>
              {authBusy ? (isSignUp ? "Creating…" : "Signing in…") : isSignUp ? "Create account" : "Sign in"}
            </button>
            <button className={styles.toggleIntent} onClick={onIntentToggle} type="button">
              {isSignUp ? "Already have an account? Sign in →" : "Don't have an account? Sign up →"}
            </button>
            {authError && <p className={styles.authError}>{authError}</p>}
          </>
        )}
      </div>

      <button className={styles.skipLink} onClick={onSkip} style={{ marginTop: 16 }}>Set up later</button>
    </div>
  )
}

// ── Step 3: Create Project ────────────────────────────────────────────────────

function StepCreateProject({
  projectName, projectDesc, scanUrl, scanBusy, scanError,
  projectBusy, projectError, onNameChange, onDescChange,
  onScanUrlChange, onScan, onCreate, onSkip,
}: {
  projectName: string; projectDesc: string
  scanUrl: string; scanBusy: boolean; scanError: string | null
  projectBusy: boolean; projectError: string | null
  onNameChange: (v: string) => void; onDescChange: (v: string) => void
  onScanUrlChange: (v: string) => void; onScan: () => void
  onCreate: () => void; onSkip: () => void
}) {
  return (
    <div className={styles.authStep}>
      <h1 className={styles.heading} style={{ fontSize: 32, marginBottom: 8 }}>
        Create your first project
      </h1>
      <p className={styles.subheading} style={{ marginBottom: 32 }}>
        Paste your project URL to auto-fill details from your site or docs, or fill in manually.
      </p>

      <div className={styles.authForm}>
        <div className={styles.scanRow}>
          <input className={styles.authInput} type="text" placeholder="Project URL (e.g. myapp.com)"
            value={scanUrl} onChange={(e) => onScanUrlChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void onScan() }} />
          <button className={styles.scanBtn} onClick={onScan} disabled={scanBusy || !scanUrl.trim()}>
            {scanBusy ? "Scanning…" : "Scan"}
          </button>
        </div>
        {scanError && <p className={styles.authError}>{scanError}</p>}

        <input
          className={styles.authInput}
          type="text"
          placeholder="Project name *"
          value={projectName}
          onChange={(e) => onNameChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void onCreate() }}
          autoFocus
        />
        <textarea
          className={styles.authTextarea}
          placeholder="Description (optional)"
          value={projectDesc}
          onChange={(e) => onDescChange(e.target.value)}
          rows={3}
        />

        {projectError && <p className={styles.authError}>{projectError}</p>}
        <button className={styles.primaryBtn} style={{ width: "100%" }} onClick={onCreate}
          disabled={projectBusy || !projectName.trim()}>
          {projectBusy ? "Creating…" : "Create project"}
        </button>
      </div>

      <button className={styles.skipLink} onClick={onSkip} style={{ marginTop: 16 }}>
        Skip for now
      </button>
    </div>
  )
}

// ── Step 4: Persona ───────────────────────────────────────────────────────────

function StepPersona({
  personaKind, personaSources, busy, onChooseKind, onToggleSource, onContinue, onSkip,
}: {
  personaKind: OnboardingPersonaKind | null
  personaSources: string[]
  busy: boolean
  onChooseKind: (kind: OnboardingPersonaKind) => void
  onToggleSource: (source: string) => void
  onContinue: () => void
  onSkip: () => void
}) {
  const sourcesReady = personaSources.length > 0
  return (
    <div className={styles.authStep}>
      <h1 className={styles.heading} style={{ fontSize: 32, marginBottom: 8 }}>
        What should Relay remember?
      </h1>
      <p className={styles.subheading} style={{ marginBottom: 28 }}>
        {personaKind
          ? "Where does your work and context live today?"
          : "Pick what matters most — Relay tailors the setup to it."}
      </p>

      {!personaKind ? (
        <div className={styles.personaGrid}>
          {PERSONA_OPTIONS.map((o) => (
            <button key={o.kind} type="button" className={styles.personaCard} onClick={() => onChooseKind(o.kind)}>
              <span className={styles.personaCardLabel}>{o.label}</span>
              <span className={styles.personaCardHint}>{o.hint}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className={styles.personaChips}>
            {ONBOARDING_SOURCES[personaKind].map((s) => {
              const selected = personaSources.includes(s)
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onToggleSource(s)}
                  className={`${styles.personaChip} ${selected ? styles.personaChipOn : ""}`}
                >
                  {s}
                </button>
              )
            })}
          </div>
          <button
            className={styles.primaryBtn}
            style={{ width: "100%", maxWidth: 460, marginTop: 24 }}
            onClick={onContinue}
            disabled={busy || !sourcesReady}
          >
            {busy ? "Saving…" : "Continue"}
          </button>
        </>
      )}

      <button className={styles.skipLink} onClick={onSkip} style={{ marginTop: 16 }}>Skip</button>
    </div>
  )
}

// ── Step 5: Walkthrough (4 slides) ───────────────────────────────────────────

function StepWalkthrough({ onNext }: { onNext: () => void }) {
  const [slide, setSlide] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)
  const current = WALKTHROUGH_STEPS[slide]!
  const isLast = slide === WALKTHROUGH_STEPS.length - 1

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.load()
      void videoRef.current.play().catch(() => {})
    }
  }, [slide])

  function advance() {
    if (isLast) { onNext() } else { setSlide((s) => s + 1) }
  }

  function openDashboard() {
    chrome.tabs.create({ url: `${BASE_URL}/dashboard` }).catch(() => window.open(`${BASE_URL}/dashboard`, "_blank"))
  }

  return (
    <div className={styles.walkthroughStep}>
      <p className={styles.walkthroughCounter}>Getting started — {slide + 1} of {WALKTHROUGH_STEPS.length}</p>

      <div className={styles.walkthroughMedia}>
        {current.video ? (
          <video ref={videoRef} src={current.video.mp4} poster={current.video.poster}
            autoPlay loop muted playsInline className={styles.walkthroughVideo} />
        ) : current.image ? (
          <img src={current.image.src} alt={current.image.alt} className={styles.walkthroughVideo} />
        ) : null}
      </div>

      <h2 className={styles.walkthroughTitle}>{current.title}</h2>
      <p className={styles.walkthroughBody}>{current.body}</p>

      <div className={styles.walkthroughActions}>
        {current.cta && (
          <button className={styles.secondaryBtn} onClick={openDashboard}>{current.cta.label}</button>
        )}
        <button className={styles.primaryBtn} onClick={advance}>Next →</button>
      </div>

      <div className={styles.slideDotsRow}>
        {WALKTHROUGH_STEPS.map((_, i) => (
          <button key={i} className={`${styles.slideDot} ${i === slide ? styles.slideDotActive : styles.slideDotInactive}`} onClick={() => setSlide(i)} />
        ))}
      </div>
    </div>
  )
}

// ── Step 5: Shortcuts ─────────────────────────────────────────────────────────

function StepShortcuts({ onNext }: { onNext: () => void }) {
  return (
    <div className={styles.shortcutsStep}>
      <h1 className={styles.heading} style={{ fontSize: 32, marginBottom: 8 }}>
        Learn the shortcuts
      </h1>
      <p className={styles.subheading} style={{ marginBottom: 36 }}>
        Two keyboard shortcuts are all you need to use Relay from any AI chat.
      </p>

      <div className={styles.shortcutsGrid}>
        <div className={styles.shortcutCard}>
          <div className={styles.shortcutKeys}>
            <KbdKey wide>{isMac ? "⌘" : "Ctrl"}</KbdKey>
            <KbdKey wide>Shift</KbdKey>
            <KbdKey>I</KbdKey>
          </div>
          <p className={styles.shortcutCardTitle}>Insert brief</p>
          <p className={styles.shortcutCardDesc}>Inject your full project context into any AI chat instantly.</p>
        </div>

        <div className={styles.shortcutCard}>
          <div className={styles.shortcutKeys}>
            <KbdKey wide>{altKey}</KbdKey>
            <KbdKey wide>Shift</KbdKey>
            <KbdKey>S</KbdKey>
          </div>
          <p className={styles.shortcutCardTitle}>Open sidebar</p>
          <p className={styles.shortcutCardDesc}>Open the Relay sidebar from any tab without clicking the toolbar.</p>
        </div>
      </div>

      <button className={styles.primaryBtn} onClick={onNext} style={{ marginTop: 36 }}>Next →</button>
    </div>
  )
}

// ── Step 6: Pin ───────────────────────────────────────────────────────────────

function openX() {
  chrome.tabs.create({ url: "https://x.com/alimmka_" }).catch(() => window.open("https://x.com/alimmka_", "_blank"))
}

function StepPin({ isSignedIn, onOpenRelay }: { isSignedIn: boolean; onOpenRelay: () => void }) {
  const [referralLink, setReferralLink] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!isSignedIn) return
    relayFetch("/api/referral")
      .then((r) => r.ok ? r.json() : null)
      .then((d: { link?: string } | null) => { if (d?.link) setReferralLink(d.link) })
      .catch(() => {})
  }, [isSignedIn])

  function copyReferral() {
    if (!referralLink) return
    navigator.clipboard.writeText(referralLink).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (!isSignedIn) {
    return (
      <div className={styles.pinStep}>
        <h1 className={styles.pinHeading}>Set up Relay when you're ready</h1>
        <p className={styles.subheading} style={{ marginBottom: 28 }}>
          Open the sidebar anytime to sign in, create a project, and finish setup.
        </p>

        <div className={styles.pinCard}>
          <div className={styles.pinRow}>
            <div className={styles.pinRowText}>
              <p className={styles.pinRowTitle}>Setup saved for later</p>
              <p className={styles.pinRowDesc}>Relay is installed. Your next step is signing in from the extension sidebar.</p>
            </div>
          </div>
        </div>

        <button className={styles.primaryBtn} style={{ marginTop: 20, minWidth: 280 }} onClick={onOpenRelay}>
          Open Relay →
        </button>
      </div>
    )
  }

  return (
    <div className={styles.pinStep}>
      <h1 className={styles.pinHeading}>You're good to go</h1>
      <p className={styles.subheading} style={{ marginBottom: 28 }}>Relay is installed and ready to use.</p>

      <div className={styles.pinCard}>
        <div className={styles.pinRow}>
          <div className={styles.pinRowText}>
            <p className={styles.pinRowTitle}>Meet the founder</p>
            <p className={styles.pinRowDesc}>Follow the journey of building Relay</p>
          </div>
          <button className={styles.xBtn} onClick={openX}><XLogo />@alimmka_</button>
        </div>

        <div className={styles.pinRowDivider} />

        <div className={styles.pinExtRow}>
          <div className={styles.pinExtLeft}>
            <div className={styles.puzzleIconWrap}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/>
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
                <svg width="11" height="11" viewBox="0 0 24 24" fill="rgba(255,255,255,0.45)"><path d="M20.5 11H19V7c0-1.1-.9-2-2-2h-4V3.5C13 2.12 11.88 1 10.5 1S8 2.12 8 3.5V5H4c-1.1 0-1.99.9-1.99 2v3.8H3.5c1.49 0 2.7 1.21 2.7 2.7s-1.21 2.7-2.7 2.7H2V20c0 1.1.9 2 2 2h3.8v-1.5c0-1.49 1.21-2.7 2.7-2.7 1.49 0 2.7 1.21 2.7 2.7V22H17c1.1 0 2-.9 2-2v-4h1.5c1.38 0 2.5-1.12 2.5-2.5S21.88 11 20.5 11z"/></svg>
              </div>
            </div>
            <div className={styles.miniDropdown}>
              <div className={styles.miniDropHeader}>Extensions</div>
              <div className={styles.miniDropItem}>
                <img src={relayIconUrl} alt="Relay" width={16} height={16} style={{ borderRadius: 3 }} />
                <span className={styles.miniDropName}>Relay</span>
                <span className={styles.miniPinIcon}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="rgba(255,255,255,0.5)"><path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5v6h2v-6h5v-2l-2-2z"/></svg>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {referralLink ? (
        <div className={styles.referralCard}>
          <p className={styles.referralTitle}>Invite friends · earn rewards</p>
          <p className={styles.referralDesc}>They get 20% off first month. You earn commission.</p>
          <div className={styles.referralRow}>
            <code className={styles.referralCode}>{referralLink}</code>
            <button className={styles.referralCopyBtn} onClick={copyReferral} type="button">
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>
      ) : null}

      <button className={styles.primaryBtn} style={{ marginTop: 16, minWidth: 280 }} onClick={onOpenRelay}>
        Open Relay →
      </button>
    </div>
  )
}
