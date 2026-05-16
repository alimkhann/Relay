"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";

import { useSidebar } from "@/components/layout/sidebar-context";
import { useMobile } from "@/hooks/use-mobile";

export function SidebarMainArea({ children }: { children: ReactNode }) {
  const { collapsed } = useSidebar();
  const isMobile = useMobile();
  const pathname = usePathname();

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
      <AnimatePresence mode="sync" initial={false}>
        <motion.div
          key={pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.18, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
