"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Activity, ArrowUpRight, Brain, FileDown, BookOpen, Network, Files, MessageSquare } from "lucide-react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  requiresProject?: boolean;
  /** When true, render an anchor with target=_blank and show an external
   *  hint icon on hover. */
  external?: boolean;
}

export function SidebarNav({
  currentProjectId,
  collapsed = false,
  onNavigate,
}: {
  currentProjectId?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const overviewHref = currentProjectId
    ? `/dashboard?project=${currentProjectId}`
    : "/dashboard";
  const memoryHref = currentProjectId
    ? `/memory?project=${currentProjectId}`
    : "/memory";
  const graphHref = currentProjectId
    ? `/graph?project=${currentProjectId}`
    : "/graph";
  const sourcesHref = currentProjectId
    ? `/sources?project=${currentProjectId}`
    : "/sources";
  const briefHref = currentProjectId
    ? `/brief?project=${currentProjectId}`
    : "/brief";
  const activityHref = currentProjectId
    ? `/activity?project=${currentProjectId}`
    : "/activity";
  const chatHref = currentProjectId
    ? `/chat?project=${currentProjectId}`
    : "/chat";
  const docsHref = currentProjectId
    ? `/docs?project=${currentProjectId}`
    : "/docs";

  const navItems: NavItem[] = [
    {
      href: overviewHref,
      label: "Overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      href: memoryHref,
      label: "Memory",
      icon: <Brain className="h-4 w-4" />,
      requiresProject: true,
    },
    {
      href: sourcesHref,
      label: "Sources",
      icon: <Files className="h-4 w-4" />,
      requiresProject: true,
    },
    {
      href: graphHref,
      label: "Graph",
      icon: <Network className="h-4 w-4" />,
      requiresProject: true,
    },
    {
      href: briefHref,
      label: "Brief",
      icon: <FileDown className="h-4 w-4" />,
      requiresProject: true,
    },
    {
      href: activityHref,
      label: "Activity",
      icon: <Activity className="h-4 w-4" />,
      requiresProject: true,
    },
    {
      href: chatHref,
      label: "Chat",
      icon: <MessageSquare className="h-4 w-4" />,
    },
    {
      href: docsHref,
      label: "Docs",
      icon: <BookOpen className="h-4 w-4" />,
      external: true,
    },
  ];

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

        const linkContent = item.external ? (
          <a
            key={item.href}
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onNavigate}
            className={cn(sharedClassName, "group")}
          >
            <span className={iconClassName}>{item.icon}</span>
            {!collapsed && (
              <>
                <span>{item.label}</span>
                <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-[var(--relay-faint)] opacity-0 transition-opacity group-hover:opacity-100" />
              </>
            )}
          </a>
        ) : (
          <Link
            key={item.href}
            href={item.href}
            prefetch={false}
            onClick={onNavigate}
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
