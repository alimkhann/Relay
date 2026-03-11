import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/cn"

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-[12px] text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-900/20 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--relay-accent)] px-5 py-3 text-stone-50 hover:bg-[#0f110f]",
        secondary: "bg-white/72 px-5 py-3 text-stone-900 ring-1 ring-stone-900/8 hover:bg-white",
        ghost: "rounded-[10px] px-4 py-2 text-stone-700 hover:bg-stone-950/5"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export function Button({ className, variant, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button"

  return <Comp className={cn(buttonVariants({ variant }), className)} {...props} />
}
