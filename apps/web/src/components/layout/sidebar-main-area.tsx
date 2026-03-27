"use client";

import type { ReactNode } from "react";

import { useSidebar } from "@/components/layout/sidebar-context";
import { useMobile } from "@/hooks/use-mobile";

export function SidebarMainArea({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  const isMobile = useMobile();

  return (
    <main
      className="flex-1 min-h-screen transition-[margin-left] duration-200 ease-in-out pt-14 md:pt-0"
      style={{
        marginLeft: isMobile
          ? 0
          : collapsed
            ? "var(--relay-sidebar-collapsed)"
            : "var(--relay-sidebar-width)",
      }}
    >
      {children}
    </main>
  );
}
