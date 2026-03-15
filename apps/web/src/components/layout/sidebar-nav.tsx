"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Activity, Brain, FileDown } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";
import { startWorkspaceNavigation } from "@/components/layout/workspace-cache";

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
    },
  ];

  const visibleItems = navItems.filter(
    (item) => !item.requiresProject || currentProjectId,
  );

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
      {visibleItems.map((item) => {
        const itemPath = item.href.split("?")[0] ?? item.href;
        const isActive =
          pathname === itemPath || pathname.startsWith(itemPath + "/");

        const linkContent = (
          <Link
            key={item.href}
            href={item.href}
            onMouseEnter={() => router.prefetch(item.href)}
            onClick={() => {
              if (item.kind === "dashboard" && !currentProjectId) {
                return;
              }

              startWorkspaceNavigation({
                href: item.href,
                cacheKey: item.cacheKey,
                kind: item.kind === "memory" || item.kind === "brief"
                  ? "dashboard"
                  : item.kind,
                projectId:
                  item.kind !== "activity" ? currentProjectId : undefined,
              });
            }}
            className={cn(
              "flex items-center rounded-[var(--relay-radius-sm)] text-[13px] font-medium transition-colors",
              collapsed
                ? "justify-center p-2"
                : "gap-2.5 px-2.5 py-1.5",
              isActive
                ? "bg-[var(--relay-soft)] text-[var(--relay-ink)]"
                : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
            )}
          >
            <span
              className={cn(
                "shrink-0",
                isActive
                  ? "text-[var(--relay-ink)]"
                  : "text-[var(--relay-faint)]",
              )}
            >
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
