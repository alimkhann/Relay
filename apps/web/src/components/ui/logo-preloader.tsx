"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

/**
 * LogoPreloader — first-session and post-OAuth dashboard load animation.
 *
 * An inline <script> in <head> synchronously injects a full-screen overlay
 * div (#relay-preloader) before any paint, blocking the flash. This component
 * takes over that overlay via a React portal, animates the logo, then removes it.
 *
 * Sequence:
 *   1. Overlay already blocks the screen (injected by inline script, zero flash)
 *   2. Logo slides up from below (0.6s)
 *   3. Hold (1.0s)
 *   4. Logo slides up and out (0.5s)
 *   5. Overlay fades out (0.45s)
 *   6. Overlay removed from DOM, component unmounts
 *
 * Easing: cubic-bezier(0.7, 0.2, 0.2, 1) — matches Framer reference.
 */
export function LogoPreloader() {
  const [phase, setPhase] = useState<
    "idle" | "enter" | "hold" | "exit" | "fade-out" | "done"
  >("idle");
  const [isDark, setIsDark] = useState(false);
  const [overlayEl, setOverlayEl] = useState<HTMLElement | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const path = window.location.pathname;
    const isDashboardPath =
      path === "/dashboard" ||
      path.startsWith("/dashboard/") ||
      path.startsWith("/activity") ||
      path.startsWith("/memory") ||
      path.startsWith("/settings") ||
      path.startsWith("/projects") ||
      path.startsWith("/brief");

    if (!isDashboardPath) return;

    const overlay = document.getElementById("relay-preloader");
    if (!overlay) return;

    // Make the overlay a proper flex container now that we're in the body context
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";

    setOverlayEl(overlay);

    const params = new URLSearchParams(window.location.search);
    const isAuthCallback = params.get("auth_callback") === "1";

    // Mark as shown for this session
    sessionStorage.setItem("relay_preloader_shown", "1");

    // Read theme
    const dark = document.documentElement.classList.contains("dark");
    setIsDark(dark);
    overlay.style.backgroundColor = dark ? "#1a1a1c" : "#ffffff";

    // Clean up auth_callback param
    if (isAuthCallback) {
      const url = new URL(window.location.href);
      url.searchParams.delete("auth_callback");
      window.history.replaceState({}, "", url.toString());
    }

    // rAF so the portal content renders before we start the CSS transition
    rafRef.current = requestAnimationFrame(() => {
      // Need one more frame for the initial "enter" (translateY 80px) to paint
      // before transitioning to "hold" (translateY 0)
      setPhase("enter");

      requestAnimationFrame(() => {
        const t1 = setTimeout(() => setPhase("hold"), 50);    // enter → hold (near-instant, CSS does the work)
        const t2 = setTimeout(() => setPhase("exit"), 1700);  // hold → exit (1.65s hold)
        const t3 = setTimeout(() => setPhase("fade-out"), 2300);
        const t4 = setTimeout(() => {
          setPhase("done");
          overlay.remove();
        }, 2750);

        (overlay as HTMLElement & { _t?: ReturnType<typeof setTimeout>[] })._t = [t1, t2, t3, t4];
      });
    });

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      const el = document.getElementById("relay-preloader");
      (el as HTMLElement & { _t?: ReturnType<typeof setTimeout>[] } | null)?._t?.forEach(clearTimeout);
    };
  }, []);

  // Update overlay styles imperatively as phase changes
  useEffect(() => {
    if (!overlayEl) return;
    if (phase === "fade-out") {
      overlayEl.style.transition = "opacity 0.45s cubic-bezier(0.7,0.2,0.2,1)";
      overlayEl.style.opacity = "0";
    } else if (phase !== "done" && phase !== "idle") {
      overlayEl.style.transition = "none";
      overlayEl.style.opacity = "1";
    }
  }, [phase, overlayEl]);

  if (phase === "idle" || phase === "done" || !overlayEl) return null;

  const logoStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      transition:
        "transform 0.6s cubic-bezier(0.7,0.2,0.2,1), opacity 0.6s cubic-bezier(0.7,0.2,0.2,1)",
    };
    if (phase === "enter") {
      return { ...base, transform: "translateY(80px)", opacity: 0 };
    }
    if (phase === "hold") {
      return { ...base, transform: "translateY(0px)", opacity: 1 };
    }
    // exit / fade-out
    return {
      transition:
        "transform 0.5s cubic-bezier(0.7,0.2,0.2,1), opacity 0.5s cubic-bezier(0.7,0.2,0.2,1)",
      transform: "translateY(-80px)",
      opacity: 0,
    };
  })();

  return createPortal(
    <div style={logoStyle}>
      <Image
        src="/images/relay_logo_white.png"
        alt="Relay"
        width={80}
        height={80}
        className={isDark ? "" : "brightness-0"}
        priority
      />
    </div>,
    overlayEl,
  );
}
