"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Activity, Brain, FileDown } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";
import {
  startWorkspaceNavigation,
  getWorkspaceCachedSnapshot,
  revalidateRoute,
} from "@/components/layout/workspace-cache";

interface NavItem {
  href: string;
  cacheKey: string;
  kind: "dashboard" | "activity" | "memory" | "brief";
  label: string;
  icon: React.ReactNode;
  requiresProject?: boolean;
}

export function SidebarNav({
  currentProjectId,
  collapsed = false,
}: {
  currentProjectId?: string;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const overviewHref = currentProjectId
    ? `/dashboard?project=${currentProjectId}`
    : "/dashboard";
  const memoryHref = currentProjectId
    ? `/memory?project=${currentProjectId}`
    : "/memory";
  const briefHref = currentProjectId
    ? `/brief?project=${currentProjectId}`
    : "/brief";

  const navItems: NavItem[] = [
    {
      href: overviewHref,
      cacheKey: currentProjectId
        ? `dashboard:${currentProjectId}`
        : "dashboard:none",
      kind: "dashboard",
      label: "Overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      href: memoryHref,
      cacheKey: currentProjectId
        ? `memory:${currentProjectId}`
        : "memory:none",
      kind: "memory",
      label: "Memory",
      icon: <Brain className="h-4 w-4" />,
      requiresProject: true,
    },
    {
      href: briefHref,
      cacheKey: currentProjectId
        ? `brief:${currentProjectId}`
        : "brief:none",
      kind: "brief",
      label: "Brief",
      icon: <FileDown className="h-4 w-4" />,
      requiresProject: true,
    },
    {
      href: "/activity",
      cacheKey: "activity",
      kind: "activity",
      label: "Activity",
      icon: <Activity className="h-4 w-4" />,
      requiresProject: true,
    },
  ];

  useEffect(() => {
    router.prefetch(overviewHref);
    router.prefetch("/activity");
    if (currentProjectId) {
      router.prefetch(memoryHref);
      router.prefetch(briefHref);
    }
  }, [overviewHref, memoryHref, briefHref, currentProjectId, router]);

  return (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((item) => {
        const isDisabled = item.requiresProject && !currentProjectId;
        const itemPath = item.href.split("?")[0] ?? item.href;
        const isActive =
          !isDisabled &&
          (pathname === itemPath || pathname.startsWith(itemPath + "/"));

        const sharedClassName = cn(
          "flex items-center rounded-[var(--relay-radius-sm)] text-[13px] font-medium transition-colors",
          collapsed
            ? "justify-center p-2"
            : "gap-2.5 px-2.5 py-1.5",
          isDisabled
            ? "pointer-events-none opacity-40 text-[var(--relay-muted)]"
            : isActive
              ? "bg-[var(--relay-soft)] text-[var(--relay-ink)]"
              : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
        );

        const iconClassName = cn(
          "shrink-0",
          isDisabled
            ? "text-[var(--relay-faint)]"
            : isActive
              ? "text-[var(--relay-ink)]"
              : "text-[var(--relay-faint)]",
        );

        if (isDisabled) {
          const disabledContent = (
            <span
              key={item.href}
              className={sharedClassName}
              aria-disabled="true"
            >
              <span className={iconClassName}>{item.icon}</span>
              {!collapsed && <span>{item.label}</span>}
            </span>
          );

          if (collapsed) {
            return (
              <Tooltip.Root key={item.href}>
                <Tooltip.Trigger asChild>{disabledContent}</Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="right"
                    sideOffset={8}
                    className="z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
                  >
                    {item.label}
                    <Tooltip.Arrow className="fill-[var(--relay-ink)]" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            );
          }

          return disabledContent;
        }

        const linkContent = (
          <Link
            key={item.href}
            href={item.href}
            onMouseEnter={() => router.prefetch(item.href)}
            onClick={(e) => {
              if (item.kind === "dashboard" && !currentProjectId) {
                return;
              }

              const route = {
                href: item.href,
                cacheKey: item.cacheKey,
                kind: item.kind,
                projectId:
                  item.kind !== "activity" ? currentProjectId : undefined,
              } as const;

              const cached = getWorkspaceCachedSnapshot(item.cacheKey);
              if (cached) {
                e.preventDefault();
                window.history.pushState(null, "", item.href);
                startWorkspaceNavigation(route);
                void revalidateRoute(route);
              } else {
                startWorkspaceNavigation(route);
              }
            }}
            className={sharedClassName}
          >
            <span className={iconClassName}>
              {item.icon}
            </span>
            {!collapsed && <span>{item.label}</span>}
          </Link>
        );

        if (collapsed) {
          return (
            <Tooltip.Root key={item.href}>
              <Tooltip.Trigger asChild>{linkContent}</Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="right"
                  sideOffset={8}
                  className="z-50 rounded-[var(--relay-radius-sm)] bg-[var(--relay-ink)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--relay-bg)] shadow-[var(--relay-shadow)]"
                >
                  {item.label}
                  <Tooltip.Arrow className="fill-[var(--relay-ink)]" />
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          );
        }

        return linkContent;
      })}
    </nav>
  );
}
