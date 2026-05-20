"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, PanelLeftClose, PanelLeft, X, MessageSquareText } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import * as Dialog from "@radix-ui/react-dialog";
import { motion } from "motion/react";

import { cn } from "@/lib/cn";
import { useSidebar } from "@/components/layout/sidebar-context";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { SidebarProjectSwitcher } from "@/components/layout/sidebar-project-switcher";
import { SidebarReferralWidget } from "@/components/layout/sidebar-referral-widget";
import { SidebarPlanWidget } from "@/components/layout/sidebar-plan-widget";
import { AccountMenu } from "@/components/layout/account-menu";

interface SidebarProps {
  projects?: { id: string; name: string }[];
  currentProjectId?: string;
  user: {
    name: string;
    email?: string;
  } | null;
  referral?: { code: string; link: string; qualifiedCount: number };
  plan?: { plan: string; isPaid: boolean; capturesUsed: number; capturesLimit: number };
}

/* ─── Shared inner content used by both desktop aside and mobile drawer ─── */

function SidebarContent({
  projects,
  currentProjectId,
  user,
  referral,
  plan,
  collapsed,
  overviewHref,
  toggle,
  onNavigate,
}: SidebarProps & {
  collapsed: boolean;
  overviewHref: string;
  toggle: () => void;
  onNavigate?: () => void;
}) {
  return (
    <>
      {/* Logo + collapse toggle */}
      <div
        className={cn(
          "flex items-center mb-6",
          collapsed ? "justify-center" : "justify-between px-2",
        )}
      >
        {collapsed ? (
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <Link href={overviewHref} className="flex items-center justify-center" onClick={onNavigate}>
                <Image
                  src="/images/relay_logo_white.png"
                  alt="Relay"
                  width={24}
                  height={24}
                  className="brightness-0 dark:brightness-100"
                />
              </Link>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={8}
                className="z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
              >
                Relay
                <Tooltip.Arrow className="fill-[var(--relay-ink)]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ) : (
          <Link href={overviewHref} className="flex items-center" onClick={onNavigate}>
            <Image
              src="/images/relay_logo_white.png"
              alt="Relay"
              width={24}
              height={24}
              className="brightness-0 dark:brightness-100"
            />
          </Link>
        )}

        {!collapsed && (
          <button
            onClick={toggle}
            className="hidden md:inline-flex h-7 w-7 items-center justify-center rounded-[var(--relay-radius-sm)] text-[var(--relay-faint)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Expand button when collapsed */}
      {collapsed && (
        <div className="flex justify-center mb-4">
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <button
                onClick={toggle}
                className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--relay-radius-sm)] text-[var(--relay-faint)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
                aria-label="Expand sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={8}
                className="z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
              >
                Expand sidebar
                <Tooltip.Arrow className="fill-[var(--relay-ink)]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        </div>
      )}

      {/* Project switcher */}
      {projects && projects.length > 0 && (
        <SidebarProjectSwitcher
          projects={projects}
          currentId={currentProjectId}
          collapsed={collapsed}
        />
      )}

      {/* Navigation */}
      <SidebarNav currentProjectId={currentProjectId} collapsed={collapsed} onNavigate={onNavigate} />

      {/* Feedback — sits directly below Docs in the nav */}
      <div className={cn("mt-1", collapsed ? "px-1" : "")}>
        {collapsed ? (
          <Tooltip.Root>
            <Tooltip.Trigger asChild>
              <a
                href="https://relay.featurebase.app"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-[var(--relay-radius-sm)] p-2 text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
              >
                <MessageSquareText className="h-4 w-4 shrink-0" />
              </a>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                side="right"
                sideOffset={8}
                className="z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
              >
                Feedback
                <Tooltip.Arrow className="fill-[var(--relay-ink)]" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ) : (
          <a
            href="https://relay.featurebase.app"
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--relay-muted)] transition-colors hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
          >
            <MessageSquareText className="h-4 w-4 shrink-0 text-[var(--relay-faint)] group-hover:text-[var(--relay-ink)]" />
            <span>Feedback</span>
            <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--relay-faint)] opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        )}
      </div>

      {/* Referrals → Usage → account */}
      <div className="mt-auto">
        {referral && (
          <div className={cn("pb-2", collapsed ? "px-1" : "px-2")}>
            <SidebarReferralWidget
              code={referral.code}
              link={referral.link}
              qualifiedCount={referral.qualifiedCount}
              collapsed={collapsed}
            />
          </div>
        )}

        {plan && (
          <div className={cn("pb-2", collapsed ? "px-1" : "px-2")}>
            <SidebarPlanWidget
              plan={plan.plan}
              isPaid={plan.isPaid}
              capturesUsed={plan.capturesUsed}
              capturesLimit={plan.capturesLimit}
              collapsed={collapsed}
            />
          </div>
        )}

        {/* Account menu */}
        <div className="border-t border-[var(--relay-line)] pt-4">
          {user ? (
            <AccountMenu
              name={user.name}
              email={user.email}
              collapsed={collapsed}
            />
          ) : (
            !collapsed && (
              <Link
                className="px-2 text-[13px] font-medium text-[var(--relay-ink-secondary)] transition hover:text-[var(--relay-ink)]"
                href="/sign-in"
                onClick={onNavigate}
              >
                Sign in
              </Link>
            )
          )}
        </div>
      </div>
    </>
  );
}

/* ─── Main Sidebar ─── */

export function Sidebar({ projects, currentProjectId, user, referral, plan }: SidebarProps) {
  const { collapsed, toggle, mobileOpen, setMobileOpen } = useSidebar();
  const overviewHref = currentProjectId
    ? `/dashboard?project=${currentProjectId}`
    : "/dashboard";

  return (
    <Tooltip.Provider delayDuration={300}>
      {/* ── Desktop sidebar ── */}
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-40 hidden md:flex flex-col border-r border-[var(--relay-line)] bg-[var(--relay-surface)] py-6 transition-[width,padding] duration-200 ease-in-out",
          collapsed ? "w-[var(--relay-sidebar-collapsed)] px-2" : "w-[var(--relay-sidebar-width)] px-4",
        )}
      >
        <SidebarContent
          projects={projects}
          currentProjectId={currentProjectId}
          user={user}
          referral={referral}
          plan={plan}
          collapsed={collapsed}
          overviewHref={overviewHref}
          toggle={toggle}
        />
      </aside>

      {/* ── Mobile drawer ── */}
      <Dialog.Root open={mobileOpen} onOpenChange={setMobileOpen}>
        <Dialog.Portal>
          <Dialog.Overlay asChild>
            <motion.div
              className="fixed inset-0 z-50 bg-black/45 md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            />
          </Dialog.Overlay>
          <Dialog.Content asChild>
            <motion.div
              className="fixed inset-y-0 left-0 z-50 flex w-[280px] flex-col border-r border-[var(--relay-line)] bg-[var(--relay-surface)] px-4 py-6 shadow-[var(--relay-shadow-lg)] md:hidden"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
            >
              {/* Close button */}
              <button
                onClick={() => setMobileOpen(false)}
                className="absolute right-3 top-5 inline-flex h-7 w-7 items-center justify-center rounded-[var(--relay-radius-sm)] text-[var(--relay-faint)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
                aria-label="Close menu"
              >
                <X className="h-4 w-4" />
              </button>

              <SidebarContent
                projects={projects}
                currentProjectId={currentProjectId}
                user={user}
                referral={referral}
                plan={plan}
                collapsed={false}
                overviewHref={overviewHref}
                toggle={toggle}
                onNavigate={() => setMobileOpen(false)}
              />
            </motion.div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Tooltip.Provider>
  );
}
