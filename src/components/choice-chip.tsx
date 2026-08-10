import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

interface ChoiceChipProps {
  label: string
  selected: boolean
  onClick: () => void
  icon?: LucideIcon
  className?: string
  type?: "single" | "multiple"
  disabled?: boolean
}

export function ChoiceChip({
  label,
  selected,
  onClick,
  icon: Icon,
  className,
  type = "multiple",
  disabled = false,
}: ChoiceChipProps) {
  return (
    <button
      type="button"
      role={type === "single" ? "radio" : undefined}
      aria-checked={type === "single" ? selected : undefined}
      aria-pressed={type === "multiple" ? selected : undefined}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium outline-none transition-[background-color,border-color,color,box-shadow,transform] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100",
        selected
          ? "border-primary bg-primary text-primary-foreground shadow-xs"
          : "border-border bg-background text-foreground hover:border-foreground/20 hover:bg-muted/70",
        type === "single" && "flex-1",
        className,
      )}
    >
      {Icon ? <Icon className="size-4" aria-hidden="true" /> : null}
      <span>{label}</span>
    </button>
  )
}
