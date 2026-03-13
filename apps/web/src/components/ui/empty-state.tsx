import { cn } from "@/lib/cn";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, children, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      {icon && (
        <div className="mb-4 text-[var(--relay-faint)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-medium text-[var(--relay-ink)]">{title}</h3>
      {description && (
        <p className="mt-1.5 text-[13px] leading-relaxed text-[var(--relay-muted)] max-w-sm">
          {description}
        </p>
      )}
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
