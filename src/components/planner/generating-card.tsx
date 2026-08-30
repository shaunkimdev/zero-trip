import { Check, LoaderCircle, Map, Route, Search, WalletCards } from "lucide-react"

import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const stages = [
  { icon: Search, label: "조건에 맞는 장소를 찾고 있어요" },
  { icon: WalletCards, label: "운영시간과 가격을 확인하고 있어요" },
  { icon: Route, label: "장소 사이 동선과 순서를 맞추고 있어요" },
]

export function GeneratingCard({ stage }: { stage: number }) {
  return (
    <section
      id="result"
      aria-busy="true"
      aria-labelledby="generating-title"
      className="mx-auto max-w-[1240px] scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8"
    >
      <Card className="mx-auto max-w-4xl [--card-spacing:--spacing(7)]">
        <CardContent className="grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="flex flex-col justify-center">
            <span className="die-cut-sticker mb-5 grid size-14 place-items-center rounded-2xl border-[5px] border-white bg-black text-white">
              <Map className="size-5" />
            </span>
            <p className="text-xs font-bold tracking-[0.14em] text-success-foreground">BUILDING YOUR DAY</p>
            <h2 id="generating-title" className="mt-2 text-2xl font-bold tracking-[-0.04em] sm:text-3xl">
              오늘의 동선을 만드는 중
            </h2>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              조건을 넘기지 않도록 장소와 이동 순서를 하나씩 검증하고 있어요.
            </p>
            <div className="mt-7 space-y-3" role="status" aria-live="polite">
              {stages.map((item, index) => {
                const done = stage > index
                const active = stage === index
                return (
                  <div
                    key={item.label}
                    className={cn(
                      "flex items-center gap-3 rounded-full px-3.5 py-3 text-sm transition-[color,background-color,box-shadow]",
                      done && "bg-black/[.06] text-foreground",
                      active && "bg-white text-foreground shadow-[0_8px_22px_rgba(0,0,0,.07)]",
                      !done && !active && "bg-muted/70 text-muted-foreground",
                    )}
                  >
                    <span
                      className={cn(
                        "grid size-7 place-items-center rounded-full",
                        done && "bg-success text-white",
                        active && "bg-primary text-primary-foreground",
                        !done && !active && "bg-muted",
                      )}
                    >
                      {done ? (
                        <Check className="size-3.5" />
                      ) : active ? (
                        <LoaderCircle className="size-3.5 animate-spin" />
                      ) : (
                        <item.icon className="size-3.5" />
                      )}
                    </span>
                    <span className={cn(active || done ? "font-semibold" : "font-medium")}>{item.label}</span>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="soft-inset rounded-3xl bg-muted/65 p-5">
            <div className="mb-5 flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-7 w-16 rounded-full" />
            </div>
            <div className="space-y-3">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="flex gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="flex-1 rounded-2xl bg-card p-3 shadow-[0_7px_18px_rgba(0,0,0,.05)]">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="mt-2 h-4 w-3/5" />
                    <Skeleton className="mt-3 h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </section>
  )
}
