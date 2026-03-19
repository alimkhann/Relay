"use client";

import Image from "next/image";
import Link from "next/link";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";

import { cn } from "@/lib/cn";
import { useSidebar } from "@/components/layout/sidebar-context";
import { SidebarNav } from "@/components/layout/sidebar-nav";
import { SidebarProjectSwitcher } from "@/components/layout/sidebar-project-switcher";
import { AccountMenu } from "@/components/layout/account-menu";

interface SidebarProps {
  projects?: { id: string; name: string }[];
  currentProjectId?: string;
  user: {
    name: string;
    email?: string;
  } | null;
}

export function Sidebar({ projects, currentProjectId, user }: SidebarProps) {
  const { collapsed, toggle } = useSidebar();
  const overviewHref = currentProjectId
    ? `/dashboard?project=${currentProjectId}`
    : "/dashboard";

  return (
    <Tooltip.Provider delayDuration={300}>
      <aside
        className={cn(
          "fixed left-0 top-0 bottom-0 z-40 flex flex-col border-r border-[var(--relay-line)] bg-[var(--relay-surface)] py-6 transition-[width,padding] duration-200 ease-in-out",
          collapsed ? "w-[var(--relay-sidebar-collapsed)] px-2" : "w-[var(--relay-sidebar-width)] px-4",
        )}
      >
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
                <Link href={overviewHref} className="flex items-center justify-center">
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
            <Link href={overviewHref} className="flex items-center">
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
              className="inline-flex h-7 w-7 items-center justify-center rounded-[var(--relay-radius-sm)] text-[var(--relay-faint)] transition hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
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
        <SidebarNav currentProjectId={currentProjectId} collapsed={collapsed} />

        {/* Account menu */}
        <div className="mt-auto border-t border-[var(--relay-line)] pt-4">
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
              >
                Sign in
              </Link>
            )
          )}
        </div>
      </aside>
    </Tooltip.Provider>
  );
}
