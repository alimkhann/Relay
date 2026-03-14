"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { Settings, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { signOutAction } from "@/components/auth/sign-out-action";
import { startWorkspaceNavigation } from "@/components/layout/workspace-cache";
import { cn } from "@/lib/cn";

interface AccountMenuProps {
  name: string;
  email?: string;
}

export function AccountMenu({ name, email }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const initial = (name || email || "U").charAt(0).toUpperCase();

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          className={cn(
            "flex w-full items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-2 py-1.5 text-left transition-colors",
            "hover:bg-[var(--relay-soft)]",
            open && "bg-[var(--relay-soft)]",
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--relay-accent)] text-[11px] font-semibold text-white">
            {initial}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-[var(--relay-ink)]">
              {name || "Account"}
            </span>
            {email && (
              <span className="block truncate text-[11px] text-[var(--relay-muted)]">
                {email}
              </span>
            )}
          </span>
        </button>
      </Popover.Trigger>

      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content
              side="top"
              align="start"
              sideOffset={8}
              forceMount
              className="z-50 w-[var(--relay-sidebar-width)] px-4"
              onCloseAutoFocus={(e) => e.preventDefault()}
            >
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                transition={{ duration: 0.12 }}
                className="rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)] p-1 shadow-[var(--relay-shadow-lg)]"
              >
                <Link
                  href="/settings"
                  onMouseEnter={() => router.prefetch("/settings")}
                  onClick={() => {
                    setOpen(false);
                    startWorkspaceNavigation({
                      href: "/settings",
                      cacheKey: "settings",
                      kind: "settings",
                    });
                  }}
                  className="flex items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-2.5 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition-colors hover:bg-[var(--relay-soft)]"
                >
                  <Settings className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
                  Settings
                </Link>
                <div className="mx-2.5 my-1 border-t border-[var(--relay-line)]" />
                <form action={signOutAction}>
                  <button
                    type="submit"
                    className="flex w-full items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-2.5 py-2 text-[13px] font-medium text-[var(--relay-danger)] transition-colors hover:bg-[var(--relay-soft)]"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </button>
                </form>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
