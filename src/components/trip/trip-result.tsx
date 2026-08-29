import { useState } from "react"
import {
  Armchair,
  ArrowLeft,
  Bookmark,
  CalendarDays,
  Check,
  Clock3,
  Coffee,
  ExternalLink,
  Footprints,
  Images,
  Info,
  Landmark,
  MapPinned,
  MoonStar,
  MoreHorizontal,
  Music2,
  Navigation,
  RefreshCw,
  Share2,
  Sparkles,
  Trees,
  Umbrella,
  UtensilsCrossed,
  WalletCards,
  Wifi,
  type LucideIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { SeoulDotMap } from "@/components/map/seoul-dot-map"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import {
  CATEGORY_LABELS,
  type Place,
  type PlaceCategory,
  type PlannedStop,
  type RouteLeg,
  type TripPlan,
} from "@/types/trip"

interface TripResultProps {
  plan: TripPlan
  saved: boolean
  onSave: () => void
  onShare: () => void
  onRegenerate: () => void
  onEdit: () => void
}

const categoryIcons: Record<PlaceCategory, LucideIcon> = {
  museum: Landmark,
  exhibition: Images,
  event: CalendarDays,
  performance: Music2,
  park: Trees,
  walk: Footprints,
  "night-view": MoonStar,
  rest: Armchair,
  cafe: Coffee,
  restaurant: UtensilsCrossed,
  landmark: MapPinned,
}

const tagLabels: Record<string, string> = {
  indoor: "실내",
  outdoor: "야외",
  quiet: "조용함",
  art: "예술",
  history: "역사",
  architecture: "건축",
  river: "한강",
  garden: "정원",
  library: "도서관",
  accessible: "무장애",
  "pet-friendly": "반려견 동반",
}

const formatWon = (value: number) => `${value.toLocaleString("ko-KR")}원`

function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}분`
  if (!rest) return `${hours}시간`
  return `${hours}시간 ${rest}분`
}

function formatDistance(meters: number) {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters / 10) * 10}m`
}

function directionsUrl(plan: TripPlan) {
  const last = plan.stops.at(-1)
  if (!last) return "#"
  const waypoints = plan.stops
    .slice(0, -1)
    .map((stop) => `${stop.place.location.lat},${stop.place.location.lng}`)
    .join("|")
  const params = new URLSearchParams({
    api: "1",
    origin: `${plan.request.origin.lat},${plan.request.origin.lng}`,
    destination: `${last.place.location.lat},${last.place.location.lng}`,
    travelmode: "walking",
  })
  if (waypoints) params.set("waypoints", waypoints)
  return `https://www.google.com/maps/dir/?${params.toString()}`
}

export function TripResult({ plan, saved, onSave, onShare, onRegenerate, onEdit }: TripResultProps) {
  const [activeStopId, setActiveStopId] = useState(plan.stops[0]?.place.id ?? "")
  const routeUrl = directionsUrl(plan)
  const budget = plan.request.budgetWon
  const usedPercent = budget > 0 ? Math.min(100, (plan.totals.contentCostWon / budget) * 100) : 0
  const wifiStopCount = plan.stops.filter((stop) => stop.place.amenities.wifi.available).length
  const isGrounded = plan.grounding?.mode === "ragflow"

  return (
    <section id="result" className="scroll-mt-20 border-t border-border/70 bg-card/45 py-14 sm:py-18">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 lg:px-8">
        <div className="animate-fade-up">
          <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <button
                type="button"
                onClick={onEdit}
                className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/20"
              >
                <ArrowLeft className="size-3.5" />
                조건 다시 보기
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="success" className="gap-1.5">
                  <Check className="size-3" /> {isGrounded ? "RAGFlow 출처 정책 통과" : "데모 운영시간 반영"}
                </Badge>
                <Badge variant="outline">서울 · 도보 중심</Badge>
              </div>
              <h2
                id="result-title"
                tabIndex={-1}
                className="mt-4 max-w-3xl text-[32px] leading-[1.12] font-extrabold tracking-[-0.055em] outline-none sm:text-[44px]"
              >
                {plan.title}
              </h2>
              <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
                어디 갈지 고민은 끝. 예산과 운영시간에 맞춰 {plan.stops.length}곳을 이 순서로 연결했어요.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onSave} aria-pressed={saved}>
                <Bookmark className={cn("size-4", saved && "fill-current")} />
                {saved ? "저장됨" : "저장"}
              </Button>
              <Button type="button" variant="outline" onClick={onShare}>
                <Share2 className="size-4" /> 공유
              </Button>
              <Button type="button" variant="outline" onClick={onRegenerate}>
                <RefreshCw className="size-4" /> 새 코스
              </Button>
            </div>
          </div>

          {plan.stops.length > 0 ? (
            <SeoulDotMap
              plan={plan}
              activeStopId={activeStopId}
              onActiveStopChange={setActiveStopId}
              className="mb-6"
            />
          ) : null}

          <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <MetricCard
              icon={WalletCards}
              label="일정 비용"
              value={`₩${plan.totals.contentCostWon.toLocaleString("ko-KR")}`}
              accent
            />
            <MetricCard icon={Clock3} label="총 코스 시간" value={formatDuration(plan.totals.durationMinutes)} />
            <MetricCard icon={Footprints} label="예상 도보" value={formatDistance(plan.totals.walkingMeters)} />
            <MetricCard icon={MapPinned} label="방문 장소" value={`${plan.totals.stopCount}곳`} />
          </div>

          {plan.stops.length > 0 ? (
            <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,.65fr)]">
              <Card className="overflow-visible [--card-spacing:--spacing(6)]">
                <CardHeader>
                  <CardTitle className="text-lg">오늘의 일정</CardTitle>
                  <CardDescription>장소 사이 거리는 직선거리 기반 도보 추정치예요.</CardDescription>
                  <CardAction>
                    <Badge variant="lime">추천 동선 1안</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent>
                  <ol className="relative" aria-label="추천 여행 일정">
                    {plan.stops.map((stop, index) => (
                      <TimelineStop
                        key={stop.place.id}
                        stop={stop}
                        leg={plan.legs[index]}
                        index={index}
                        total={plan.stops.length}
                        active={activeStopId === stop.place.id}
                        onActivate={() => setActiveStopId(stop.place.id)}
                      />
                    ))}
                  </ol>
                </CardContent>
              </Card>

              <div className="min-w-0 space-y-5 lg:sticky lg:top-24">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <WalletCards className="size-4 text-primary" />
                      예상 일정 비용
                    </CardTitle>
                    <CardDescription>1인 기준 · 선택된 식사 포함 · 교통비 제외</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <CostRow label="입장·관람" value={plan.costs.admissionWon} />
                    <CostRow label="전시" value={plan.costs.exhibitionWon} />
                    <CostRow label="공연·행사" value={plan.costs.performanceWon} />
                    <CostRow label="카페" value={plan.costs.cafeWon} />
                    <CostRow label="식사" value={plan.costs.mealWon} />
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1.5 text-muted-foreground">
                        <Wifi className="size-3.5" /> 경로 내 Wi-Fi
                      </span>
                      <span className={cn("font-semibold", wifiStopCount > 0 && "text-success-foreground")}>
                        {wifiStopCount > 0 ? `${wifiStopCount}곳 · 무료` : "없음"}
                      </span>
                    </div>
                    <Separator className="my-4" />
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">일정 비용 합계</p>
                        <p className="tabular-nums mt-1 text-2xl font-extrabold tracking-[-0.04em]">
                          ₩{plan.costs.totalWon.toLocaleString("ko-KR")}
                        </p>
                      </div>
                      <Badge variant={plan.costs.totalWon === 0 ? "lime" : "success"}>
                        {budget === 0 ? "0원 달성" : `${formatWon(budget - plan.costs.totalWon)} 남음`}
                      </Badge>
                    </div>
                    {budget > 0 ? (
                      <div className="pt-2">
                        <Progress value={usedPercent} aria-label={`예산의 ${Math.round(usedPercent)}퍼센트 사용`} />
                        <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                          <span>사용 {formatWon(plan.costs.totalWon)}</span>
                          <span>예산 {formatWon(budget)}</span>
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-4 flex gap-2 rounded-xl bg-muted/70 p-3 text-[11px] leading-5 text-muted-foreground">
                      <Info className="mt-0.5 size-3.5 shrink-0" />
                      선택된 카페·식당은 출처가 확인된 가격대 상한으로 계산하며 교통비는 포함하지 않아요.
                    </div>
                  </CardContent>
                </Card>

                <Button asChild size="lg" className="hidden w-full lg:flex">
                  <a href={routeUrl} target="_blank" rel="noreferrer">
                    <Navigation className="size-4" /> 이 코스로 출발
                  </a>
                </Button>
              </div>
            </div>
          ) : (
            <EmptyPlan onEdit={onEdit} onRegenerate={onRegenerate} />
          )}

          {plan.warnings.length > 0 ? (
            <div className="mt-6 rounded-xl border border-border bg-muted/45 p-4">
              <p className="text-xs font-bold">출발 전에 확인해 주세요</p>
              <ul className="mt-2 space-y-1 text-xs leading-5 text-muted-foreground">
                {plan.warnings.map((warning) => (
                  <li key={warning}>• {warning}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 text-[11px] leading-5 text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>
              {isGrounded
                ? `RAGFlow 검색 ${plan.grounding?.retrievedChunkCount ?? 0}건 · 정책 통과 후보 ${plan.grounding?.acceptedPlaceCount ?? 0}곳 중 ${plan.stops.length}곳 사용`
                : "데모 데이터 · 실제 출발 전 공식 운영정보와 예약 여부를 다시 확인해 주세요."}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Sparkles className="size-3" /> 조건 기반 경로 최적화 결과
            </span>
          </div>
        </div>
      </div>

      {plan.stops.length > 0 ? (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/94 p-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:hidden">
          <Button asChild size="lg" className="mx-auto flex w-full max-w-md">
            <a href={routeUrl} target="_blank" rel="noreferrer">
              <Navigation className="size-4" /> 이 코스로 출발
            </a>
          </Button>
        </div>
      ) : null}
    </section>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/9 shadow-[0_1px_2px_rgba(20,30,24,0.035)] sm:p-5">
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Icon className={cn("size-3.5", accent && "text-success-foreground")} /> {label}
      </div>
      <p className={cn("tabular-nums mt-2 text-xl font-extrabold tracking-[-0.04em]", accent && "text-primary")}>
        {value}
      </p>
    </div>
  )
}

function TimelineStop({
  stop,
  leg,
  index,
  total,
  active,
  onActivate,
}: {
  stop: PlannedStop
  leg?: RouteLeg
  index: number
  total: number
  active: boolean
  onActivate: () => void
}) {
  const Icon = categoryIcons[stop.place.category]
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${stop.place.location.lat},${stop.place.location.lng}`
  const visibleTags = stop.place.tags.filter((tag) => tagLabels[tag]).slice(0, 2)

  return (
    <li className="relative pl-12 sm:pl-15" onMouseEnter={onActivate}>
      {leg ? (
        <div className="relative min-h-12 pb-3">
          <div className="absolute top-0 bottom-0 left-[-29px] w-px border-l border-dashed border-border sm:left-[-35px]" />
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-muted-foreground">
            <Footprints className="size-3.5" />
            <span>{index === 0 ? "출발지에서" : "다음 장소까지"}</span>
            <span className="text-foreground">도보 {leg.durationMinutes}분</span>
            <span>·</span>
            <span>{formatDistance(leg.distanceMeters)}</span>
          </div>
        </div>
      ) : null}

      <div
        className={cn(
          "relative mb-6 rounded-2xl border bg-background p-4 transition-[border-color,box-shadow,transform] sm:p-5",
          active
            ? "border-primary/35 shadow-[0_8px_30px_rgba(26,70,50,0.08)]"
            : "border-border hover:border-foreground/18",
        )}
      >
        <span
          className={cn(
            "absolute top-4 left-[-49px] z-10 grid size-9 place-items-center rounded-full border-[3px] border-card font-bold shadow-sm sm:left-[-62px] sm:size-11",
            active ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
          )}
          aria-hidden="true"
        >
          {index + 1}
        </span>
        {index < total - 1 ? (
          <span className="absolute top-10 bottom-[-26px] left-[-33px] w-px bg-border sm:top-12 sm:left-[-41px]" aria-hidden="true" />
        ) : null}

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="tabular-nums text-xs font-bold text-primary">
                {stop.startTime}–{stop.departTime}
              </span>
              <Badge variant="secondary" className="gap-1">
                <Icon className="size-3" /> {CATEGORY_LABELS[stop.place.category]}
              </Badge>
            </div>
            <h3 className="mt-2 text-lg font-bold tracking-[-0.03em]">{stop.place.name}</h3>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{stop.place.summary}</p>
          </div>
          <Button asChild variant="ghost" size="icon-sm" className="-mt-1 -mr-1 shrink-0" aria-label={`${stop.place.name} 지도에서 보기`}>
            <a href={mapUrl} target="_blank" rel="noreferrer" onFocus={onActivate}>
              <ExternalLink className="size-4" />
            </a>
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5">
          <Badge variant={stop.costWon === 0 ? "lime" : "outline"}>
            {stop.costWon === 0 ? "무료" : formatWon(stop.costWon)}
          </Badge>
          <Badge variant="success">
            {stop.place.source.name.includes("데모") ? "데모 운영시간 기준" : "출처 정책 통과"}
          </Badge>
          {stop.waitMinutes > 0 ? (
            <Badge variant="outline">일정 대기 {stop.waitMinutes}분</Badge>
          ) : null}
          {stop.place.amenities.wifi.available ? (
            <Badge
              variant="outline"
              className="max-w-full gap-1"
              title={`${stop.place.amenities.wifi.ssid ?? "Wi-Fi"} · ${stop.place.amenities.wifi.location ?? "설치 위치 확인"}`}
            >
              <Wifi className="size-3" />
              <span className="truncate">{stop.place.amenities.wifi.ssid ?? "Wi-Fi"}</span>
            </Badge>
          ) : null}
          {visibleTags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tagLabels[tag]}
            </Badge>
          ))}
        </div>

        {stop.reasons.length > 0 ? (
          <div className="mt-4 flex gap-2 rounded-lg bg-muted/60 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
            <Sparkles className="mt-0.5 size-3.5 shrink-0 text-success-foreground" />
            <span>{stop.reasons.slice(0, 2).join(" · ")}</span>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-x-2 text-[10px] leading-4 text-muted-foreground">
          <span>
            출처 · {stop.place.source.name} · {stop.place.source.updatedAt.slice(0, 10)} 기준
          </span>
          {stop.place.source.url ? (
            <a
              href={stop.place.source.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 underline decoration-border underline-offset-2 hover:text-foreground"
            >
              원문 확인 <ExternalLink className="size-2.5" />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  )
}

function CostRow({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums font-semibold">{formatWon(value)}</span>
    </div>
  )
}

function EmptyPlan({ onEdit, onRegenerate }: { onEdit: () => void; onRegenerate: () => void }) {
  return (
    <Card className="mx-auto max-w-2xl text-center [--card-spacing:--spacing(8)]">
      <CardContent className="grid justify-items-center">
        <span className="grid size-14 place-items-center rounded-2xl bg-secondary">
          <Umbrella className="size-6 text-primary" />
        </span>
        <h3 className="mt-5 text-xl font-bold tracking-[-0.03em]">이 조건으로는 코스를 완성하기 어려워요.</h3>
        <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
          예산이나 이용 시간을 바꾸면 더 좋은 코스를 찾을 수 있어요.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <Button type="button" onClick={onRegenerate}>
            <RefreshCw className="size-4" /> 추천 조건으로 다시 만들기
          </Button>
          <Button type="button" variant="outline" onClick={onEdit}>
            직접 수정하기
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
