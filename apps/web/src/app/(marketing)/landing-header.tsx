"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

export function LandingHeader() {
  const [shaped, setShaped] = useState(false);
  const [filled, setFilled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShaped(window.scrollY > 20);
      setFilled(window.scrollY > window.innerHeight * 1.3);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav
        className={`mx-auto flex items-center justify-between transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] px-6 py-5 max-w-6xl border border-transparent bg-transparent ${
          shaped
            ? "lg:mt-3 lg:max-w-4xl lg:rounded-[20px] lg:border-white/[0.12] lg:bg-white/[0.08] lg:px-5 lg:py-2.5 lg:shadow-[0_2px_16px_rgba(0,0,0,0.06)] lg:backdrop-blur-2xl"
            : "lg:px-10 lg:py-6"
        } ${filled ? "lg:!border-black/[0.06] lg:!bg-white/70" : ""}`}
        data-animate="nav"
      >
        <Link href="/" className="flex items-center">
          <Image
            src="/images/relay_logo_white.png"
            alt="Relay"
            width={64}
            height={64}
            className={`transition-all duration-500 ${
              filled
                ? "scale-[0.7] brightness-0"
                : shaped
                  ? "scale-[0.7]"
                  : "drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
            }`}
          />
        </Link>

        <Link
          href="/sign-in"
          className={`inline-flex items-center gap-1.5 rounded-full px-5 py-2 text-sm font-semibold transition-all duration-300 ${
            filled
              ? "bg-[#111210] text-white shadow-sm hover:bg-[#2a2d2a]"
              : "bg-white text-[#111210] shadow-[0_2px_12px_rgba(0,0,0,0.15)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.25)] hover:-translate-y-px"
          }`}
        >
          Get started
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </nav>
    </header>
  );
}
