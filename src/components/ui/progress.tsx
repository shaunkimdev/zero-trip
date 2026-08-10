import * as React from "react"

import { cn } from "@/lib/utils"

function Progress({
  value = 0,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & { value?: number }) {
  const safeValue = Math.min(100, Math.max(0, value))

  return (
    <div
      data-slot="progress"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(safeValue)}
      className={cn("relative h-2 w-full overflow-hidden rounded-full bg-muted", className)}
      {...props}
    >
      <div
        className="h-full rounded-full bg-primary transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${100 - safeValue}%)` }}
      />
    </div>
  )
}

export { Progress }
