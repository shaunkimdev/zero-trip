import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold outline-none transition-[color,background-color,box-shadow,transform] disabled:pointer-events-none disabled:opacity-50 focus-visible:ring-[3px] focus-visible:ring-ring/25 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-black text-white shadow-[0_12px_26px_rgba(0,0,0,.18)] hover:bg-black/82 hover:shadow-[0_15px_32px_rgba(0,0,0,.22)]",
        secondary: "bg-secondary text-secondary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.9)] hover:bg-secondary/72",
        outline:
          "bg-white text-black shadow-[0_9px_24px_rgba(0,0,0,.075),0_2px_7px_rgba(0,0,0,.035)] hover:bg-[#f8f8f7] hover:shadow-[0_12px_30px_rgba(0,0,0,.1)]",
        ghost: "hover:bg-white hover:text-foreground hover:shadow-[0_8px_22px_rgba(0,0,0,.07)]",
        lime: "bg-white text-black shadow-[0_12px_28px_rgba(0,0,0,.16)] hover:bg-[#eeeeec]",
        destructive:
          "bg-destructive text-white shadow-xs hover:bg-destructive/90 focus-visible:ring-destructive/20",
      },
      size: {
        default: "h-11 px-4 py-2",
        sm: "h-9 gap-1.5 px-3 text-xs",
        lg: "h-13 px-6 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
