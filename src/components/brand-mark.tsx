import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        aria-hidden="true"
        className="relative grid size-8 place-items-center rounded-[10px] bg-primary text-primary-foreground shadow-sm"
      >
        <span className="-translate-y-px text-[16px] font-extrabold tracking-[-0.08em]">₩0</span>
        <span className="absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-background bg-accent" />
      </div>
      <div className="leading-none">
        <div className="text-[15px] font-extrabold tracking-[-0.035em]">ZERO TRIP</div>
        <div className="mt-1 text-[9px] font-semibold tracking-[0.17em] text-muted-foreground">
          BUDGET DAY PLANNER
        </div>
      </div>
    </div>
  )
}
