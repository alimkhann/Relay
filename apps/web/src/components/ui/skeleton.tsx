import { cn } from "@/lib/cn"

/** Shared shimmer placeholder. Use to mirror real content layout so the
 *  skeleton→content swap doesn't jump. */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded bg-[var(--relay-soft)]",
        className,
      )}
    />
  )
}
