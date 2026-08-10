import {
  CalendarDays,
  Check,
  Clock3,
  Footprints,
  MapPin,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Wifi,
} from "lucide-react"

import { SeoulDotSilhouette } from "@/components/map/seoul-dot-map"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import type { PlannerValues } from "@/types/planner-ui"

interface PlannerSummaryProps {
  values: PlannerValues
  onSubmit: () => void
  generating: boolean
}

const companionLabels = {
  solo: "혼자",
  couple: "연인",
  children: "아이와",
  parents: "부모님과",
  pet: "반려견과",
}

const wantsLabels: Record<string, string> = {
  free: "무료",
  exhibition: "전시",
  performance: "공연",
  park: "공원",
  walk: "산책",
  "night-view": "야경",
  photo: "사진",
  culture: "문화",
  cafe: "카페",
  rest: "휴식",
}

function formatTime(minutes: number) {
  if (minutes === 24 * 60) return "24:00"
  const hour = Math.floor(minutes / 60)
  const minute = minutes % 60
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

function dateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`)
  const today = new Date()
  const todayString = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10)
  if (value === todayString) return "오늘"
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", weekday: "short" }).format(date)
}

export function PlannerSummary({ values, onSubmit, generating }: PlannerSummaryProps) {
  const budgetText = values.budget === 0 ? "0원" : `${values.budget.toLocaleString("ko-KR")}원`
  const endTime = formatTime(values.startMin + values.durationMin)

  return (
    <div className="space-y-4 lg:sticky lg:top-24">
      <Card className="relative isolate overflow-hidden border-0 bg-primary py-0 text-primary-foreground ring-0 shadow-[0_24px_60px_rgba(24,66,48,0.2)]">
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 opacity-30 [background-image:radial-gradient(circle_at_80%_10%,oklch(0.91_0.14_125)_0,transparent_30%),linear-gradient(to_right,transparent_49%,rgba(255,255,255,.06)_50%,transparent_51%)] [background-size:auto,26px_26px]"
        />
        <CardHeader className="gap-4 px-6 pt-6 pb-0 sm:px-7 sm:pt-7">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-bold tracking-[0.14em] text-primary-foreground/60">MY DAY BRIEF</p>
              <h2 className="mt-1 text-xl font-bold tracking-[-0.035em]">내 코스 조건</h2>
            </div>
            <Badge variant="lime" className="border-0">
              조건 즉시 반영
            </Badge>
          </div>
        </CardHeader>

        <CardContent className="px-6 pt-5 pb-7 sm:px-7">
          <div className="rounded-2xl bg-white/[0.075] p-4 ring-1 ring-white/12 backdrop-blur-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-medium text-primary-foreground/60">오늘 쓸 예산</p>
                <p className="tabular-nums mt-1 text-[34px] font-extrabold tracking-[-0.055em]">
                  ₩{values.budget.toLocaleString("ko-KR")}
                </p>
              </div>
              <div className="grid size-11 place-items-center rounded-xl bg-accent text-accent-foreground">
                <WalletCards className="size-5" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <SummaryItem icon={MapPin} text={values.originLabel} />
              <SummaryItem icon={CalendarDays} text={dateLabel(values.date)} />
              <SummaryItem icon={Clock3} text={`${formatTime(values.startMin)}–${endTime}`} />
              <SummaryItem icon={Footprints} text={`최대 ${values.maxWalkKm}km`} />
            </div>
          </div>

          <div className="my-6 overflow-hidden rounded-xl bg-[#f8f7f4] ring-1 ring-white/15">
            <SeoulDotSilhouette
              origin={{ lat: values.lat, lng: values.lng }}
              className="mx-auto h-32 w-[86%]"
            />
            <p className="border-t border-black/8 px-4 py-2 text-center text-[10px] font-medium text-[#596159]">
              실제 서울 행정경계를 점으로 샘플링했어요
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2.5 text-sm leading-6">
              <Check className="mt-1 size-4 shrink-0 text-accent" />
              <p>
                <strong>{companionLabels[values.companion]}</strong> 즐기기 좋은 장소를 골라요.
              </p>
            </div>
            <div className="flex gap-2.5 text-sm leading-6">
              <Check className="mt-1 size-4 shrink-0 text-accent" />
              <p>
                {values.wants.slice(0, 3).map((want) => wantsLabels[want]).join(" · ") || "다양한 활동"} 중심으로 연결해요.
              </p>
            </div>
            <div className="flex gap-2.5 text-sm leading-6">
              <Check className="mt-1 size-4 shrink-0 text-accent" />
              <p>
                콘텐츠 비용 <strong>{budgetText} 이하</strong>만 담아요.
              </p>
            </div>
          </div>

          <Button
            type="button"
            variant="lime"
            size="lg"
            className="mt-7 hidden w-full shadow-[0_8px_30px_rgba(195,241,80,0.14)] lg:flex"
            onClick={onSubmit}
            disabled={generating}
          >
            <Sparkles className={cn("size-4", generating && "animate-spin")} />
            {generating
              ? "코스를 맞추고 있어요"
              : values.budget === 0
                ? "0원 코스 만들기"
                : `${budgetText} 코스 만들기`}
          </Button>
          <p className="mt-2 hidden text-center text-[11px] text-primary-foreground/50 lg:block">
            회원가입 없이 바로 만들 수 있어요.
          </p>
        </CardContent>
      </Card>

      <Card size="sm" className="[--card-spacing:--spacing(4)]">
        <CardContent className="grid grid-cols-3 gap-2 text-center">
          <TrustItem icon={ShieldCheck} title="가격 필터" caption="미확인 제외" />
          <TrustItem icon={Clock3} title="시간 필터" caption="데모 기준" />
          <TrustItem icon={Wifi} title="무료 Wi-Fi" caption="동선에 표시" />
        </CardContent>
      </Card>
    </div>
  )
}

function SummaryItem({ icon: Icon, text }: { icon: typeof MapPin; text: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg bg-black/8 px-2.5 py-2">
      <Icon className="size-3.5 shrink-0 text-accent" />
      <span className="truncate font-medium">{text}</span>
    </div>
  )
}

function TrustItem({ icon: Icon, title, caption }: { icon: typeof ShieldCheck; title: string; caption: string }) {
  return (
    <div className="grid justify-items-center gap-1.5 py-1">
      <span className="grid size-8 place-items-center rounded-full bg-secondary">
        <Icon className="size-4 text-primary" />
      </span>
      <div>
        <p className="text-xs font-bold">{title}</p>
        <p className="mt-0.5 text-[10px] text-muted-foreground">{caption}</p>
      </div>
    </div>
  )
}
