"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Settings, Activity } from "lucide-react";
import { cn } from "@/lib/cn";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
}

const navItems: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: <LayoutDashboard className="h-4 w-4" /> },
  { href: "/activity", label: "Activity", icon: <Activity className="h-4 w-4" /> },
  { href: "/settings", label: "Settings", icon: <Settings className="h-4 w-4" /> },
];

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-0.5">
      {navItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
        return (
          <Link
            key={item.href}
            href={item.href}
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
