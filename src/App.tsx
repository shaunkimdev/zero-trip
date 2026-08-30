import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { BusFront, Check, Clock3, Database, MapPinned, Route, Sparkles } from "lucide-react"
import { toast } from "sonner"

import { AppHeader } from "@/components/app-header"
import { BrandMark } from "@/components/brand-mark"
import { FloatingNavigation } from "@/components/floating-navigation"
import { GeneratingCard } from "@/components/planner/generating-card"
import { PlannerForm } from "@/components/planner/planner-form"
import { PlannerSummary } from "@/components/planner/planner-summary"
import { Badge } from "@/components/ui/badge"
import { TripResult } from "@/components/trip/trip-result"
import { planTrip } from "@/lib/planner"
import { isTripPlan, requestTripPlan } from "@/lib/trip-api"
import {
  DEFAULT_PLANNER_VALUES,
  ORIGINS,
  type CompanionKey,
  type PlannerValues,
  type WantKey,
} from "@/types/planner-ui"
import type { TransportMode, TripPlan } from "@/types/trip"

const SAVED_KEY = "zero-trip:saved-plans"
const MAX_ACCESS_WALKING_KM: Record<TransportMode, number> = {
  walk: 12,
  transit: 4,
  car: 2,
}

interface SavedPlan {
  id: string
  title: string
  savedAt: string
  values: PlannerValues
  variant: number
  plan: TripPlan
}

function isTransportMode(value: unknown): value is TransportMode {
  return value === "walk" || value === "transit" || value === "car"
}

function loadSavedPlans(): SavedPlan[] {
  try {
    const value = localStorage.getItem(SAVED_KEY)
    const parsed = value ? (JSON.parse(value) as Partial<SavedPlan>[]) : []
    return parsed.flatMap((item): SavedPlan[] => {
      if (
        typeof item.id !== "string" ||
        typeof item.title !== "string" ||
        !item.values ||
        !isTripPlan(item.plan)
      ) {
        return []
      }

      const storedValues = item.values as Partial<PlannerValues>
      const transportMode = isTransportMode(storedValues.transportMode)
        ? storedValues.transportMode
        : isTransportMode(item.plan.request.transportMode)
          ? item.plan.request.transportMode
          : "walk"

      return [{
        ...(item as SavedPlan),
        values: { ...DEFAULT_PLANNER_VALUES, ...storedValues, transportMode },
        plan: {
          ...item.plan,
          request: { ...item.plan.request, transportMode },
        },
      }]
    })
  } catch {
    return []
  }
}

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds))

function minuteToTime(value: number) {
  const safeValue = Math.min(value, 24 * 60)
  if (safeValue === 24 * 60) return "24:00"
  return `${String(Math.floor(safeValue / 60)).padStart(2, "0")}:${String(safeValue % 60).padStart(2, "0")}`
}

function createTripRequest(values: PlannerValues, variant: number) {
  return {
    origin: { lat: values.lat, lng: values.lng, label: values.originLabel },
    transportMode: values.transportMode,
    date: values.date,
    startTime: minuteToTime(values.startMin),
    endTime: minuteToTime(values.startMin + values.durationMin),
    budgetWon: values.budget,
    maxWalkingKm: MAX_ACCESS_WALKING_KM[values.transportMode],
    companion: values.companion,
    wants: values.wants,
    avoids: [],
    partySize: 1,
    variant,
  } as const
}

function createDemoTripPlan(values: PlannerValues, variant: number) {
  const plan = planTrip(createTripRequest(values, variant))
  return {
    ...plan,
    grounding: {
      mode: "demo",
      provider: "ZERO TRIP 서울 데모 카탈로그",
      retrievedAt: new Date().toISOString(),
      retrievedChunkCount: 0,
      acceptedPlaceCount: 0,
      rejectedChunkCount: 0,
    },
  } satisfies TripPlan
}

const companions = new Set<CompanionKey>(["solo", "couple", "children", "parents", "pet"])
const originKeys = new Set<PlannerValues["originKey"]>([
  ...ORIGINS.map((origin) => origin.key),
  "current",
])
const wants = new Set<WantKey>([
  "free",
  "exhibition",
  "night-view",
  "walk",
  "cafe",
  "food",
  "performance",
  "park",
  "culture",
  "photo",
  "rest",
])
function loadSharedState(): { values: PlannerValues; variant: number } | null {
  try {
    const params = new URLSearchParams(window.location.search)
    if (params.get("trip") !== "1") return null

    const numberParam = (key: string, fallback: number) => {
      const value = Number(params.get(key))
      return Number.isFinite(value) ? value : fallback
    }
    const companionParam = params.get("companion") as CompanionKey | null
    const transportParam = params.get("transportMode")
    const wantsParam = params.get("wants")
    const sharedWants = (wantsParam ?? "")
      .split(",")
      .filter((value): value is WantKey => wants.has(value as WantKey))
    const values: PlannerValues = {
      ...DEFAULT_PLANNER_VALUES,
      originKey: originKeys.has(params.get("originKey") as PlannerValues["originKey"])
        ? (params.get("originKey") as PlannerValues["originKey"])
        : DEFAULT_PLANNER_VALUES.originKey,
      originLabel: params.get("originLabel") ?? DEFAULT_PLANNER_VALUES.originLabel,
      lat: numberParam("lat", DEFAULT_PLANNER_VALUES.lat),
      lng: numberParam("lng", DEFAULT_PLANNER_VALUES.lng),
      transportMode: isTransportMode(transportParam)
        ? transportParam
        : DEFAULT_PLANNER_VALUES.transportMode,
      date: /^\d{4}-\d{2}-\d{2}$/.test(params.get("date") ?? "")
        ? params.get("date")!
        : DEFAULT_PLANNER_VALUES.date,
      startMin: Math.min(21 * 60, Math.max(9 * 60, numberParam("start", DEFAULT_PLANNER_VALUES.startMin))),
      durationMin: [180, 360, 540].includes(numberParam("duration", DEFAULT_PLANNER_VALUES.durationMin))
        ? numberParam("duration", DEFAULT_PLANNER_VALUES.durationMin)
        : DEFAULT_PLANNER_VALUES.durationMin,
      budget: Math.min(50_000, Math.max(0, numberParam("budget", DEFAULT_PLANNER_VALUES.budget))),
      companion:
        companionParam && companions.has(companionParam)
          ? companionParam
          : DEFAULT_PLANNER_VALUES.companion,
      wants: wantsParam === null ? DEFAULT_PLANNER_VALUES.wants : sharedWants,
    }
    if (values.startMin + values.durationMin > 24 * 60) values.durationMin = 180
    const variant = Math.max(0, Math.trunc(numberParam("variant", 0)))
    return { values, variant }
  } catch {
    return null
  }
}

function buildShareUrl(values: PlannerValues, variant: number) {
  const nearestPublicOrigin =
    values.originKey === "current"
      ? [...ORIGINS].sort((left, right) => {
          const leftDistance = (left.lat - values.lat) ** 2 + (left.lng - values.lng) ** 2
          const rightDistance = (right.lat - values.lat) ** 2 + (right.lng - values.lng) ** 2
          return leftDistance - rightDistance
        })[0]
      : null
  const shareValues: PlannerValues = nearestPublicOrigin
    ? {
        ...values,
        originKey: nearestPublicOrigin.key,
        originLabel: nearestPublicOrigin.label,
        lat: nearestPublicOrigin.lat,
        lng: nearestPublicOrigin.lng,
      }
    : values
  const url = new URL(window.location.href)
  url.search = ""
  const params = url.searchParams
  params.set("trip", "1")
  params.set("originKey", shareValues.originKey)
  params.set("originLabel", shareValues.originLabel)
  params.set("lat", String(shareValues.lat))
  params.set("lng", String(shareValues.lng))
  params.set("transportMode", values.transportMode)
  params.set("date", values.date)
  params.set("start", String(values.startMin))
  params.set("duration", String(values.durationMin))
  params.set("budget", String(values.budget))
  params.set("companion", values.companion)
  params.set("wants", values.wants.join(","))
  params.set("variant", String(variant))
  return { url: url.toString(), generalizedLocation: Boolean(nearestPublicOrigin) }
}

const sharedInitialState = loadSharedState()

function scrollToGeneratedCourse() {
  const map = document.getElementById("course-map")
  const target = map ?? document.getElementById("result")
  target?.scrollIntoView({
    behavior: "smooth",
    block: map ? "center" : "start",
  })
}

function App() {
  const [values, setValues] = useState<PlannerValues>(
    sharedInitialState?.values ?? DEFAULT_PLANNER_VALUES,
  )
  const [plan, setPlan] = useState<TripPlan | null>(null)
  const [variant, setVariant] = useState(sharedInitialState?.variant ?? 0)
  const [generating, setGenerating] = useState(false)
  const [generationStage, setGenerationStage] = useState(0)
  const [locating, setLocating] = useState(false)
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>(loadSavedPlans)
  const sharedPlanRequested = useRef(false)

  const isSaved = useMemo(
    () => Boolean(plan && savedPlans.some((savedPlan) => savedPlan.id === plan.id)),
    [plan, savedPlans],
  )

  const generateCourse = useCallback(
    async (nextVariant = variant, requestValues = values) => {
      if (generating) return
      setGenerating(true)
      setGenerationStage(0)

      window.setTimeout(() => {
        document.getElementById("result")?.scrollIntoView({ behavior: "smooth", block: "start" })
      }, 80)

      try {
        await wait(320)
        setGenerationStage(1)
        await wait(340)
        setGenerationStage(2)
        await wait(420)

        const request = createTripRequest(requestValues, nextVariant)
        const nextPlan =
          (await requestTripPlan(request)) ?? createDemoTripPlan(requestValues, nextVariant)

        setPlan(nextPlan)
        setGenerating(false)
        window.setTimeout(() => {
          scrollToGeneratedCourse()
          document.getElementById("result-title")?.focus({ preventScroll: true })
        }, 80)
      } catch (error) {
        setGenerating(false)
        console.error(error)
        toast.error("코스를 만드는 중 문제가 생겼어요.", {
          description:
            error instanceof Error && error.message.trim()
              ? error.message
              : "잠시 후 다시 시도해 주세요.",
        })
      }
    },
    [generating, values, variant],
  )

  useEffect(() => {
    if (!sharedInitialState || sharedPlanRequested.current) return
    sharedPlanRequested.current = true
    void generateCourse(sharedInitialState.variant, sharedInitialState.values)
  }, [generateCourse])

  const handleRegenerate = () => {
    const nextVariant = variant + 1
    setVariant(nextVariant)
    void generateCourse(nextVariant, values)
  }

  const handleValuesChange = (nextValues: PlannerValues) => {
    setValues(nextValues)
    setVariant(0)
    if (plan) setPlan(null)
  }

  const handleUseLocation = () => {
    if (!("geolocation" in navigator)) {
      toast.error("이 브라우저에서는 현재 위치를 사용할 수 없어요.")
      return
    }

    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setValues((current) => ({
          ...current,
          originKey: "current",
          originLabel: "내 현재 위치",
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }))
        setPlan(null)
        setLocating(false)
        toast.success("현재 위치를 출발지로 설정했어요.")
      },
      () => {
        setLocating(false)
        toast.error("위치를 사용할 수 없어요.", {
          description: "동네나 역을 직접 선택해 주세요.",
        })
      },
      { enableHighAccuracy: false, timeout: 8_000, maximumAge: 300_000 },
    )
  }

  const handleSave = () => {
    if (!plan) return
    const alreadySaved = savedPlans.some((item) => item.id === plan.id)
    const next = alreadySaved
      ? savedPlans.filter((item) => item.id !== plan.id)
      : [
          ...savedPlans,
          {
            id: plan.id,
            title: plan.title,
            savedAt: new Date().toISOString(),
            values,
            variant,
            plan,
          },
        ]
    setSavedPlans(next)
    localStorage.setItem(SAVED_KEY, JSON.stringify(next))
    toast.success(alreadySaved ? "저장에서 삭제했어요." : "이 코스를 저장했어요.", {
      description: alreadySaved ? undefined : "출발 위치와 함께 이 브라우저에만 보관됩니다.",
    })
  }

  const handleShare = async () => {
    if (!plan) return
    const text = `${plan.title} · ${plan.totals.stopCount}곳 · 일정 비용 ${plan.totals.contentCostWon.toLocaleString("ko-KR")}원`
    const { url: shareUrl, generalizedLocation } = buildShareUrl(values, variant)
    try {
      if (navigator.share) {
        await navigator.share({ title: plan.title, text, url: shareUrl })
      } else {
        await navigator.clipboard.writeText(`${text}\n${shareUrl}`)
        toast.success("공유 문구를 복사했어요.")
      }
      if (generalizedLocation) {
        toast.info("정확한 현재 위치는 공유하지 않았어요.", {
          description: "가장 가까운 서울 기준점으로 바꿔 개인정보를 보호했어요.",
        })
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      toast.error("공유하지 못했어요. 잠시 후 다시 시도해 주세요.")
    }
  }

  const handleSavedClick = () => {
    if (savedPlans.length === 0) {
      toast("아직 저장한 코스가 없어요.", { description: "마음에 드는 코스를 만들고 저장해 보세요." })
      return
    }
    const latest = savedPlans.at(-1)!
    setValues(latest.values)
    setVariant(latest.variant)
    const hasLiveIntegration = Boolean(
      latest.plan.integrations &&
        Object.values(latest.plan.integrations).some((integration) => integration !== undefined),
    )
    if (
      latest.plan.grounding?.mode === "ragflow" ||
      hasLiveIntegration
    ) {
      setPlan(null)
      toast("저장한 조건을 최신 API 정보로 다시 확인하고 있어요.", {
        description: latest.title,
      })
      void generateCourse(latest.variant, latest.values)
      return
    }
    setPlan(latest.plan)
    toast.success(`저장한 코스 ${savedPlans.length}개 중 최근 코스를 열었어요.`, {
      description: latest.title,
    })
    window.setTimeout(scrollToGeneratedCourse, 80)
  }

  const scrollToPlanner = () => {
    setPlan(null)
    window.setTimeout(() => {
      document.getElementById("planner")?.scrollIntoView({ behavior: "smooth", block: "start" })
      document.getElementById("planner-title")?.focus({ preventScroll: true })
    }, 40)
  }

  return (
    <div id="top" className="pb-28 lg:pb-0">
      <AppHeader savedCount={savedPlans.length} onSavedClick={handleSavedClick} />

      <main>
        <section className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="ambient-grid absolute inset-x-0 top-0 -z-10 h-[590px]" />
          <div
            aria-hidden="true"
            className="absolute top-[-180px] left-[62%] -z-20 size-[460px] rounded-full bg-white/80 blur-[100px]"
          />
          <div className="mx-auto max-w-[1240px] px-4 pt-4 pb-10 sm:px-6 sm:pt-8 lg:px-8 lg:pt-10 lg:pb-14">
            <div className="soft-card relative grid overflow-hidden rounded-[2.25rem] p-6 sm:grid-cols-[minmax(0,1fr)_250px] sm:items-center sm:p-9 lg:grid-cols-[minmax(0,1fr)_320px] lg:p-12">
              <div aria-hidden="true" className="absolute -top-24 -right-20 size-72 rounded-full bg-[#eeeeec] blur-2xl" />
              <div className="relative z-10 max-w-3xl">
                <Badge variant="secondary" className="mb-5 gap-1.5 px-3.5 py-2">
                  <span className="size-1.5 animate-pulse rounded-full bg-black" />
                  서울에서 바로 떠날 코스
                </Badge>
                <h1 className="text-[39px] leading-[1.04] font-extrabold tracking-[-0.065em] text-balance sm:text-[52px] lg:text-[62px]">
                  오늘 얼마로
                  <br />
                  <span className="mt-2 inline-flex rounded-full bg-black px-4 py-1.5 text-white shadow-[0_14px_30px_rgba(0,0,0,.18)]">
                    놀까요?
                  </span>
                </h1>
                <p className="mt-6 max-w-xl text-[15px] leading-7 text-muted-foreground sm:text-[17px] sm:leading-8">
                  예산과 시간만 정하면, 지금 갈 수 있는 장소를 연결해 오늘 실행할 코스 하나를 만들어요.
                </p>
                <div className="mt-7 flex flex-wrap gap-2.5 text-xs font-semibold text-foreground/75">
                  <HeroPoint icon={Check} label="예산 초과 없이" />
                  <HeroPoint icon={Clock3} label="운영시간에 맞게" />
                  <HeroPoint icon={BusFront} label="이동수단에 맞춰" />
                </div>
              </div>
              <HeroSticker />
            </div>
          </div>
        </section>

        <section id="planner" className="scroll-mt-20 pb-16 sm:pb-20">
          <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold tracking-[0.13em] text-success-foreground">PLAN YOUR DAY</p>
                <h2
                  id="planner-title"
                  tabIndex={-1}
                  className="mt-1 text-2xl font-bold tracking-[-0.04em] outline-none sm:text-3xl"
                >
                  내 조건만 알려주세요
                </h2>
              </div>
              <Badge variant="secondary" className="hidden gap-1.5 sm:flex">
                <Database className="size-3.5" /> 서울 MVP
              </Badge>
            </div>

            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(350px,.8fr)]">
              <PlannerForm
                values={values}
                onChange={handleValuesChange}
                onSubmit={() => void generateCourse()}
                onUseCurrentLocation={handleUseLocation}
                locating={locating}
                generating={generating}
              />
              <PlannerSummary values={values} onSubmit={() => void generateCourse()} generating={generating} />
            </div>
          </div>
        </section>

        {generating ? <GeneratingCard stage={generationStage} /> : null}
        {!generating && plan ? (
          <TripResult
            key={plan.id}
            plan={plan}
            saved={isSaved}
            onSave={handleSave}
            onShare={() => void handleShare()}
            onRegenerate={handleRegenerate}
            onEdit={scrollToPlanner}
          />
        ) : null}
      </main>

      <footer className="bg-transparent">
        <div className="mx-auto flex max-w-[1240px] flex-col gap-4 px-4 py-8 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
          <BrandMark className="opacity-75" />
          <p className="max-w-xl text-[11px] leading-5 text-muted-foreground sm:text-right">
            {plan?.grounding?.mode === "ragflow"
              ? "ZERO TRIP은 RAGFlow 검색 결과를 예산·운영시간·선택한 이동수단 제약으로 다시 검증합니다."
              : "ZERO TRIP은 현재 서울 데모 데이터를 사용합니다. 실제 출발 전 가격·휴관일·예약 여부를 공식 채널에서 확인하세요."}
          </p>
        </div>
      </footer>

      <FloatingNavigation
        hasPlan={Boolean(plan)}
        savedCount={savedPlans.length}
        onSavedClick={handleSavedClick}
      />
    </div>
  )
}

function HeroPoint({ icon: Icon, label }: { icon: typeof Check; label: string }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-[#f1f1ef] py-1.5 pr-3 pl-1.5 shadow-[inset_0_1px_0_white]">
      <span className="grid size-6 place-items-center rounded-full bg-black text-white">
        <Icon className="size-3" />
      </span>
      {label}
    </span>
  )
}

function HeroSticker() {
  return (
    <div aria-hidden="true" className="relative z-10 mx-auto mt-8 h-52 w-52 sm:mt-0 lg:h-64 lg:w-64">
      <div className="die-cut-sticker absolute inset-3 rotate-[5deg] rounded-[44%_56%_48%_52%/52%_42%_58%_48%] border-[8px] border-white bg-black text-white lg:border-[10px]">
        <Sparkles className="absolute top-8 right-8 size-5" />
        <Route className="absolute bottom-10 left-8 size-8 -rotate-12 opacity-75" />
        <MapPinned className="absolute right-8 bottom-8 size-7" />
        <div className="absolute inset-0 grid place-content-center text-center">
          <span className="text-[42px] font-black tracking-[-0.09em] lg:text-[54px]">₩0</span>
          <span className="mt-1 text-[9px] font-bold tracking-[0.22em] text-white/62 lg:text-[10px]">SEOUL DAY</span>
        </div>
      </div>
      <span className="soft-control absolute right-0 bottom-4 -rotate-6 rounded-full bg-white px-4 py-2 text-[11px] font-black tracking-[0.12em] text-black">
        FREE ROUTE
      </span>
    </div>
  )
}

export default App
