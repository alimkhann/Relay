import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-[var(--relay-radius)] text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--relay-accent)]/20 disabled:pointer-events-none disabled:opacity-40",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--relay-accent)] px-5 py-2.5 text-[var(--relay-accent-text)] shadow-[var(--relay-shadow-sm)] hover:bg-[var(--relay-accent-hover)] hover:shadow-[var(--relay-shadow)]",
        secondary:
          "bg-[var(--relay-surface)] px-5 py-2.5 text-[var(--relay-ink)] border border-[var(--relay-line-strong)] hover:bg-[var(--relay-soft)]",
        ghost:
          "px-4 py-2 text-[var(--relay-muted)] hover:bg-[var(--relay-soft)] hover:text-[var(--relay-ink)]",
        outline:
          "bg-[var(--relay-surface)] px-5 py-2.5 text-[var(--relay-ink)] border border-[var(--relay-line-strong)] hover:bg-[var(--relay-soft)]",
        destructive:
          "bg-[var(--relay-danger)] px-5 py-2.5 text-[var(--relay-accent-text)] hover:opacity-90",
        link: "px-1 py-1 text-[var(--relay-accent)] underline-offset-4 hover:underline",
      },
      size: {
        default: "",
        sm: "text-xs px-3.5 py-2 rounded-[var(--relay-radius-sm)]",
        lg: "text-base px-6 py-3",
        icon: "h-9 w-9 p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot : "button";

  return (
    <Comp
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
