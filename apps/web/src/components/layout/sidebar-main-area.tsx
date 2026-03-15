"use client";

import type { ReactNode } from "react";

import { useSidebar } from "@/components/layout/sidebar-context";

export function SidebarMainArea({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <main
      className="flex-1 min-h-screen transition-[margin-left] duration-200 ease-in-out"
      style={{
        marginLeft: collapsed
          ? "var(--relay-sidebar-collapsed)"
          : "var(--relay-sidebar-width)",
      }}
    >
      {children}
    </main>
  );
}
