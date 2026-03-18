"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

/**
 * LogoPreloader — post-OAuth first-load animation.
 *
 * Activates when the URL contains `?auth_callback=1`.
 * Removes the param immediately, then runs:
 *   1. White screen fades in (instant, already present)
 *   2. Logo slides up from below into center (0.6s)
 *   3. Hold (1.0s)
 *   4. Logo slides up and out (0.5s)
 *   5. White screen fades out (0.4s)
 *   6. Unmounts
 *
 * Easing: cubic-bezier(0.7, 0.2, 0.2, 1) — matches Framer reference.
 */
export function LogoPreloader() {
  const [phase, setPhase] = useState<
    "hidden" | "enter" | "hold" | "exit" | "fade-out" | "done"
  >("hidden");
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Read search params without useSearchParams (no Suspense needed)
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth_callback") !== "1") return;

    // Remove the param from URL immediately (no navigation)
    const url = new URL(window.location.href);
    url.searchParams.delete("auth_callback");
    window.history.replaceState({}, "", url.toString());

    // Kick off the animation sequence
    setPhase("enter");

    const t1 = setTimeout(() => setPhase("hold"), 700);    // enter → hold
    const t2 = setTimeout(() => setPhase("exit"), 1700);   // hold → exit (1s hold)
    const t3 = setTimeout(() => setPhase("fade-out"), 2300); // exit → fade-out
    const t4 = setTimeout(() => setPhase("done"), 2750);   // fade-out → unmount

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  if (phase === "hidden" || phase === "done") return null;

  const logoStyle = (() => {
    const base: React.CSSProperties = {
      transition: "transform 0.6s cubic-bezier(0.7, 0.2, 0.2, 1), opacity 0.6s cubic-bezier(0.7, 0.2, 0.2, 1)",
    };

    if (phase === "enter") {
      // Starting state — will transition to "hold" position
      return {
        ...base,
        transform: "translateY(80px)",
        opacity: 0,
      };
    }
    if (phase === "hold") {
      return {
        ...base,
        transform: "translateY(0px)",
        opacity: 1,
      };
    }
    if (phase === "exit") {
      return {
        ...base,
        transition: "transform 0.5s cubic-bezier(0.7, 0.2, 0.2, 1), opacity 0.5s cubic-bezier(0.7, 0.2, 0.2, 1)",
        transform: "translateY(-80px)",
        opacity: 0,
      };
    }
    // fade-out: logo already gone, just bg fading
    return {
      ...base,
      transform: "translateY(-80px)",
      opacity: 0,
    };
  })();

  const overlayStyle: React.CSSProperties = {
    transition: phase === "fade-out"
      ? "opacity 0.45s cubic-bezier(0.7, 0.2, 0.2, 1)"
      : "none",
    opacity: phase === "fade-out" ? 0 : 1,
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-white"
      style={overlayStyle}
      aria-hidden="true"
    >
      <div style={logoStyle}>
        <Image
          src="/images/relay_logo_white.png"
          alt="Relay"
          width={56}
          height={56}
          className="brightness-0"
          priority
        />
      </div>
    </div>
  );
}
