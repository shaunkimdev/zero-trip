import { cn } from "@/lib/utils"

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        aria-hidden="true"
        className="die-cut-sticker relative grid size-9 place-items-center rounded-[13px] border-[3px] border-white bg-black text-white"
      >
        <span className="-translate-y-px text-[16px] font-extrabold tracking-[-0.08em]">₩0</span>
        <span className="absolute -right-1 -bottom-1 size-3 rounded-full border-[3px] border-white bg-black" />
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
