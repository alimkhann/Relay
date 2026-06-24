"use client";

import { useState } from "react";
import Link from "next/link";
import * as Popover from "@radix-ui/react-popover";
import * as Tooltip from "@radix-ui/react-tooltip";
import { Settings, LogOut, CreditCard } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

import { cn } from "@/lib/cn";
import { signOutFromBrowser } from "@/lib/auth/sign-out-client";

interface AccountMenuProps {
  name: string;
  email?: string;
  collapsed?: boolean;
}

export function AccountMenu({ name, email, collapsed = false }: AccountMenuProps) {
  const [open, setOpen] = useState(false);
  const initial = (name || email || "U").charAt(0).toUpperCase();

  const avatar = (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--relay-accent)] text-[11px] font-semibold text-[var(--relay-accent-text)]">
      {initial}
    </span>
  );

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        {collapsed ? (
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                className={cn(
                  "flex w-full items-center justify-center rounded-[var(--relay-radius-sm)] py-1.5 transition-colors",
                  "hover:bg-[var(--relay-soft)]",
                  open && "bg-[var(--relay-soft)]",
                )}
              >
                {avatar}
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={8}
                className="z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
              >
                {name || "Account"}
                <Tooltip.Arrow className="fill-[var(--relay-ink)]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ) : (
          <button
            className={cn(
              "flex w-full items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-2 py-1.5 text-left transition-colors",
              "hover:bg-[var(--relay-soft)]",
              open && "bg-[var(--relay-soft)]",
            )}
          >
            {avatar}
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
        )}
      </Popover.Trigger>

      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content
              side="top"
              align={collapsed ? "center" : "start"}
              sideOffset={8}
              forceMount
              className={cn(
                "z-50",
                collapsed
                  ? "w-48"
                  : "w-[var(--relay-sidebar-width)]",
              )}
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
                  prefetch={false}
                  onClick={() => {
                    setOpen(false);
                  }}
                  className="flex items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-2.5 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition-colors hover:bg-[var(--relay-soft)]"
                >
                  <Settings className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
                  Settings
                </Link>
                <Link
                  href="/settings?section=billing"
                  prefetch={false}
                  onClick={() => {
                    setOpen(false);
                  }}
                  className="flex items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-2.5 py-2 text-[13px] font-medium text-[var(--relay-ink)] transition-colors hover:bg-[var(--relay-soft)]"
                >
                  <CreditCard className="h-3.5 w-3.5 text-[var(--relay-faint)]" />
                  Billing
                </Link>
                <div className="mx-2.5 my-1 border-t border-[var(--relay-line)]" />
                <form
                  action="/auth/sign-out"
                  method="POST"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void signOutFromBrowser();
                  }}
                >
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
