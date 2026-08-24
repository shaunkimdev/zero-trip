import {
  Baby,
  Camera,
  Coffee,
  Footprints,
  Heart,
  Landmark,
  LocateFixed,
  MoonStar,
  Music2,
  Palette,
  PawPrint,
  PersonStanding,
  Sparkles,
  Trees,
  Umbrella,
  UserRound,
  Users,
  Wifi,
} from "lucide-react"

import { ChoiceChip } from "@/components/choice-chip"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { cn } from "@/lib/utils"
import {
  getMinimumPlanningDate,
  getNextPlanningStart,
  localDateString,
  ORIGINS,
  type CompanionKey,
  type PlannerValues,
  type WantKey,
} from "@/types/planner-ui"

interface PlannerFormProps {
  values: PlannerValues
  onChange: (next: PlannerValues) => void
  onSubmit: () => void
  onUseCurrentLocation: () => void
  locating: boolean
  generating: boolean
}

const companionOptions = [
  { value: "solo" as const, label: "혼자", icon: UserRound },
  { value: "couple" as const, label: "연인", icon: Heart },
  { value: "children" as const, label: "아이", icon: Baby },
  { value: "parents" as const, label: "부모님", icon: Users },
  { value: "pet" as const, label: "반려견", icon: PawPrint },
]

const wantOptions = [
  { value: "free" as const, label: "무료", icon: Sparkles },
  { value: "exhibition" as const, label: "전시", icon: Palette },
  { value: "performance" as const, label: "공연", icon: Music2 },
  { value: "park" as const, label: "공원", icon: Trees },
  { value: "walk" as const, label: "산책", icon: Footprints },
  { value: "night-view" as const, label: "전망·야경", icon: MoonStar },
  { value: "photo" as const, label: "사진", icon: Camera },
  { value: "culture" as const, label: "문화", icon: Landmark },
  { value: "cafe" as const, label: "카페", icon: Coffee },
  { value: "rest" as const, label: "휴식", icon: Umbrella },
]

const startTimes = Array.from({ length: 25 }, (_, index) => {
  const value = 9 * 60 + index * 30
  const hour = Math.floor(value / 60)
  const minute = value % 60
  return {
    value,
    label: `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`,
  }
})

const formatWon = (value: number) => `${value.toLocaleString("ko-KR")}원`

function SectionTitle({
  step,
  title,
  description,
}: {
  step: string
  title: string
  description?: string
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-secondary text-[10px] font-bold text-secondary-foreground">
        {step}
      </span>
      <div>
        <h3 className="text-[15px] font-semibold tracking-[-0.015em]">{title}</h3>
        {description ? <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p> : null}
      </div>
    </div>
  )
}

function Divider() {
  return <div className="my-7 h-px bg-border/80" />
}

export function PlannerForm({
  values,
  onChange,
  onSubmit,
  onUseCurrentLocation,
  locating,
  generating,
}: PlannerFormProps) {
  const set = <K extends keyof PlannerValues>(key: K, value: PlannerValues[K]) => {
    onChange({ ...values, [key]: value })
  }

  const nextStart = getNextPlanningStart()
  const isToday = values.date === localDateString()
  const durationOptions = [
    { value: 180, label: "3시간" },
    { value: 360, label: "6시간" },
    { value: 540, label: "하루" },
  ]

  const toggleWant = (value: WantKey) => {
    const selected = values.wants.includes(value)
    set("wants", selected ? values.wants.filter((item) => item !== value) : [...values.wants, value])
  }

  return (
    <form
      aria-busy={generating}
      inert={generating}
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit()
      }}
      className="rounded-2xl bg-card p-5 ring-1 ring-foreground/9 shadow-[0_1px_2px_rgba(20,30,24,0.035)] transition-opacity sm:p-7 aria-busy:opacity-75"
    >
      <fieldset>
        <legend className="sr-only">여행 출발 위치</legend>
        <SectionTitle step="01" title="어디서 시작할까요?" description="서울의 대표 동네를 기준으로 동선을 만들어요." />
        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
          <label className="sr-only" htmlFor="origin">
            출발 위치
          </label>
          <div className="relative">
            <MapPinIcon />
            <select
              id="origin"
              value={values.originKey === "current" ? "current" : values.originKey}
              onChange={(event) => {
                if (event.target.value === "current") return
                const origin = ORIGINS.find((item) => item.key === event.target.value)
                if (origin) {
                  onChange({
                    ...values,
                    originKey: origin.key,
                    originLabel: origin.label,
                    lat: origin.lat,
                    lng: origin.lng,
                  })
                }
              }}
              className="h-12 w-full appearance-none rounded-xl border border-input bg-background pr-10 pl-10 text-sm font-medium outline-none transition focus:border-ring focus:ring-[3px] focus:ring-ring/20"
            >
              {values.originKey === "current" ? <option value="current">{values.originLabel}</option> : null}
              {ORIGINS.map((origin) => (
                <option key={origin.key} value={origin.key}>
                  {origin.label} — {origin.sublabel}
                </option>
              ))}
            </select>
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute top-1/2 right-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            >
              <path d="m6 8 4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <Button
            type="button"
            variant="outline"
            className="h-12"
            onClick={onUseCurrentLocation}
            disabled={locating}
          >
            <LocateFixed className={cn("size-4", locating && "animate-spin")} />
            {locating ? "찾는 중" : "내 위치"}
          </Button>
        </div>
      </fieldset>

      <Divider />

      <fieldset>
        <legend className="sr-only">여행 예산</legend>
        <SectionTitle
          step="02"
          title="쓸 수 있는 예산"
          description="관광·전시·공연과 선택한 카페 음료까지 함께 계산해요."
        />
        <div className="mb-5 flex items-end justify-between gap-4">
          <div>
            <span className="block text-xs font-medium text-muted-foreground">1인 기준</span>
            <output className="tabular-nums mt-1 block text-[32px] font-extrabold tracking-[-0.055em]">
              ₩{values.budget.toLocaleString("ko-KR")}
            </output>
          </div>
          <span className="mb-1 rounded-full bg-accent/70 px-2.5 py-1 text-[11px] font-bold text-accent-foreground">
            {values.budget === 0 ? "완전 무료" : `최대 ${formatWon(values.budget)}`}
          </span>
        </div>
        <Slider
          value={[values.budget]}
          min={0}
          max={50_000}
          step={5_000}
          onValueChange={([value]) => set("budget", value)}
          aria-label="여행 예산"
          aria-valuetext={formatWon(values.budget)}
        />
        <div className="mt-3 flex justify-between text-[10px] font-medium text-muted-foreground">
          <span>0원</span>
          <span>50,000원</span>
        </div>
        <div className="mt-4 grid grid-cols-5 gap-1.5">
          {[0, 10_000, 20_000, 30_000, 50_000].map((amount) => (
            <button
              key={amount}
              type="button"
              aria-pressed={values.budget === amount}
              onClick={() => set("budget", amount)}
              className={cn(
                "min-h-9 rounded-lg border px-1 text-[11px] font-semibold outline-none transition focus-visible:ring-[3px] focus-visible:ring-ring/20",
                values.budget === amount
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background hover:bg-muted",
              )}
            >
              {amount === 0 ? "0원" : `${amount / 10_000}만원`}
            </button>
          ))}
        </div>
      </fieldset>

      <Divider />

      <fieldset>
        <legend className="sr-only">여행 날짜와 시간</legend>
        <SectionTitle step="03" title="언제, 얼마나 놀까요?" />
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-xs font-semibold">
            날짜
            <input
              type="date"
              value={values.date}
              min={getMinimumPlanningDate()}
              onChange={(event) => {
                const date = event.target.value
                const startMin =
                  date === localDateString() && values.startMin < nextStart.startMin
                    ? nextStart.startMin
                    : values.startMin
                const maxDuration = 24 * 60 - startMin
                const durationMin =
                  values.durationMin <= maxDuration
                    ? values.durationMin
                    : [...durationOptions].reverse().find((item) => item.value <= maxDuration)?.value ?? 180
                onChange({ ...values, date, startMin, durationMin })
              }}
              className="h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-sm font-medium outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20"
            />
          </label>
          <label className="grid gap-1.5 text-xs font-semibold">
            시작 시간
            <select
              value={values.startMin}
              onChange={(event) => {
                const startMin = Number(event.target.value)
                const maxDuration = 24 * 60 - startMin
                const durationMin =
                  values.durationMin <= maxDuration
                    ? values.durationMin
                    : [...durationOptions].reverse().find((item) => item.value <= maxDuration)?.value ?? 180
                onChange({ ...values, startMin, durationMin })
              }}
              className="h-11 min-w-0 rounded-xl border border-input bg-background px-3 text-sm font-medium outline-none focus:border-ring focus:ring-[3px] focus:ring-ring/20"
            >
              {startTimes.map((time) => (
                <option
                  key={time.value}
                  value={time.value}
                  disabled={isToday && time.value < nextStart.startMin}
                >
                  {time.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="이용 시간">
          {durationOptions.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              selected={values.durationMin === option.value}
              onClick={() => set("durationMin", option.value)}
              disabled={values.startMin + option.value > 24 * 60}
              type="single"
            />
          ))}
        </div>
      </fieldset>

      <Divider />

      <fieldset>
        <legend className="sr-only">동행자</legend>
        <SectionTitle
          step="04"
          title="누구와 가나요?"
          description="추천 분위기를 맞추고, 비용은 동행 인원과 관계없이 1인 기준으로 보여줘요."
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5" role="radiogroup" aria-label="동행자 선택">
          {companionOptions.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              icon={option.icon}
              selected={values.companion === option.value}
              onClick={() => set("companion", option.value as CompanionKey)}
              type="single"
              className="sm:flex-col sm:gap-1.5 sm:px-1 sm:py-3"
            />
          ))}
        </div>
      </fieldset>

      <Divider />

      <fieldset>
        <legend className="sr-only">원하는 활동</legend>
        <SectionTitle step="05" title="하고 싶은 것" description="마음 가는 대로 여러 개 골라도 좋아요." />
        <div className="flex flex-wrap gap-2">
          {wantOptions.map((option) => (
            <ChoiceChip
              key={option.value}
              label={option.label}
              icon={option.icon}
              selected={values.wants.includes(option.value)}
              onClick={() => toggleWant(option.value)}
            />
          ))}
        </div>
      </fieldset>

      <div className="mt-8 lg:hidden">
        <Button type="submit" size="lg" className="w-full" disabled={generating}>
          <Sparkles className="size-4" />
          {generating
            ? "코스를 맞추고 있어요"
            : values.budget === 0
              ? "0원 코스 만들기"
              : `${formatWon(values.budget)} 코스 만들기`}
        </Button>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">회원가입 없이 바로 만들 수 있어요.</p>
      </div>
    </form>
  )
}

function MapPinIcon() {
  return (
    <span className="pointer-events-none absolute top-1/2 left-3.5 z-10 -translate-y-1/2 text-muted-foreground">
      <Landmark className="size-4" />
    </span>
  )
}
