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
  // /chat is a full-bleed chat surface: no inner padding, the chat owns the
  // entire viewport height under the sidebar.
  const isFullBleed = pathname === "/chat";

  return (
    <main
      className={`flex-1 transition-[margin-left] duration-200 ease-in-out pt-14 md:pt-0 ${
        isFullBleed ? "h-screen overflow-hidden" : "min-h-screen"
      }`}
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
          className={isFullBleed ? "h-full" : ""}
        >
          {isFullBleed ? (
            children
          ) : (
            <div className="mx-auto max-w-7xl 2xl:max-w-[1440px] p-4 sm:p-8 lg:p-12">
              {children}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </main>
  );
}
