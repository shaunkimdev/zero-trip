import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none whitespace-nowrap transition-[color,background-color,box-shadow] [&>svg]:size-3",
  {
    variants: {
      variant: {
        default: "bg-black text-white",
        secondary: "bg-secondary text-secondary-foreground",
        outline: "bg-white text-foreground shadow-[0_6px_16px_rgba(0,0,0,.065)]",
        success: "bg-black/[.07] text-black",
        lime: "bg-white text-black shadow-[0_6px_18px_rgba(0,0,0,.12)]",
        muted: "bg-muted text-muted-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
