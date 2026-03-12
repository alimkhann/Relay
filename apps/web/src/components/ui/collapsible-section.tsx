"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export function CollapsibleSection({
  title,
  children,
  defaultOpen = true,
  action,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  action?: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section>
      <div className="flex items-center justify-between">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-2 py-1"
        >
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          <ChevronDown
            className={`h-4 w-4 text-[var(--relay-faint)] transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
          />
        </button>
        {action}
      </div>
      <div
        className={`grid transition-all duration-300 ease-out ${
          open
            ? "grid-rows-[1fr] opacity-100 mt-3"
            : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="overflow-hidden">{children}</div>
      </div>
    </section>
  );
}
