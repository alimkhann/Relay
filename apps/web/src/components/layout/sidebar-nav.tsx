"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LayoutDashboard, Activity } from "lucide-react";
import { cn } from "@/lib/cn";
import { startWorkspaceNavigation } from "@/components/layout/workspace-cache";

interface NavItem {
  href: string;
  cacheKey: string;
  kind: "dashboard" | "activity";
  label: string;
  icon: React.ReactNode;
}

export function SidebarNav({ currentProjectId }: { currentProjectId?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const overviewHref = currentProjectId ? `/dashboard?project=${currentProjectId}` : "/dashboard";
  const navItems: NavItem[] = [
    {
      href: overviewHref,
      cacheKey: currentProjectId ? `dashboard:${currentProjectId}` : "dashboard:none",
      kind: "dashboard",
      label: "Overview",
      icon: <LayoutDashboard className="h-4 w-4" />,
    },
    {
      href: "/activity",
      cacheKey: "activity",
      kind: "activity",
      label: "Activity",
      icon: <Activity className="h-4 w-4" />,
    },
  ];

  useEffect(() => {
    router.prefetch(overviewHref);
    router.prefetch("/activity");
  }, [overviewHref, router]);

  return (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((item) => {
        const itemPath = item.href.split("?")[0] ?? item.href;
        const isActive = pathname === itemPath || pathname.startsWith(itemPath + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
            onMouseEnter={() => router.prefetch(item.href)}
            onClick={() =>
              startWorkspaceNavigation({
                href: item.href,
                cacheKey: item.cacheKey,
                kind: item.kind,
                projectId: item.kind === "dashboard" ? (currentProjectId ?? null) : undefined,
              })
            }
            className={cn(
              "flex items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-2.5 py-1.5 text-[13px] font-medium transition-colors",
              isActive
                ? "bg-[var(--relay-soft)] text-[var(--relay-ink)]"
                : "text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]"
            )}
          >
            <span className={cn("shrink-0", isActive ? "text-[var(--relay-ink)]" : "text-[var(--relay-faint)]")}>
              {item.icon}
            </span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
