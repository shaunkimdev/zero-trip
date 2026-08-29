import { Activity, ExternalLink, Footprints, MapPin, RefreshCw, Route } from "lucide-react"

import {
  SEOUL_BOUNDARY_SOURCE,
  seoulGuBoundaries,
  type SeoulGuProperties,
} from "@/data/seoul-boundaries"
import {
  SEOUL_POPULATION_SOURCE,
  SEOUL_POPULATION_SPOTS,
} from "@/data/seoul-population-spots"
import { seoulPlaces } from "@/data/seoul-places"
import { useSeoulPopulation } from "@/hooks/use-seoul-population"
import {
  createGeoProjection,
  findContainingFeature,
  getFeatureCollectionBounds,
  sampleFeatureCollection,
  type GeoPosition,
} from "@/lib/geo"
import { cn } from "@/lib/utils"
import type {
  SeoulCongestionLevel,
  SeoulPopulationPoint,
} from "@/types/seoul-population"
import type { GeoPoint, Place, PlannedStop, TripPlan } from "@/types/trip"

const MAP_WIDTH = 900
const MAP_HEIGHT = 520
const DOT_SPACING = 11
const DOT_RADIUS = 3.15

const seoulBounds = getFeatureCollectionBounds(seoulGuBoundaries)
const seoulProjection = createGeoProjection(
  seoulBounds,
  MAP_WIDTH,
  MAP_HEIGHT,
  34,
)
const seoulDots = sampleFeatureCollection(
  seoulGuBoundaries,
  seoulProjection,
  DOT_SPACING,
)

const HAN_RIVER_CENTERLINE: readonly GeoPosition[] = [
  [126.79, 37.588],
  [126.825, 37.578],
  [126.858, 37.566],
  [126.89, 37.55],
  [126.918, 37.533],
  [126.945, 37.524],
  [126.976, 37.515],
  [127.008, 37.513],
  [127.04, 37.519],
  [127.073, 37.522],
  [127.105, 37.521],
  [127.137, 37.53],
  [127.17, 37.547],
]

type ScreenPoint = { x: number; y: number }

function dottedPolyline(
  points: readonly ScreenPoint[],
  spacing: number,
  laneOffsets: readonly number[] = [0],
) {
  const dots: ScreenPoint[] = []

  for (let segment = 0; segment < points.length - 1; segment += 1) {
    const from = points[segment]
    const to = points[segment + 1]
    const dx = to.x - from.x
    const dy = to.y - from.y
    const length = Math.hypot(dx, dy)
    const steps = Math.max(1, Math.floor(length / spacing))
    const normalX = length > 0 ? -dy / length : 0
    const normalY = length > 0 ? dx / length : 0

    for (let step = 0; step < steps; step += 1) {
      const progress = step / steps
      const x = from.x + dx * progress
      const y = from.y + dy * progress
      for (const laneOffset of laneOffsets) {
        dots.push({
          x: x + normalX * laneOffset,
          y: y + normalY * laneOffset,
        })
      }
    }
  }

  return dots
}

const hanRiverDots = dottedPolyline(
  HAN_RIVER_CENTERLINE.map((point) => seoulProjection.project(point)),
  8.5,
  [-5.5, 0, 5.5],
)
const hanRiverLabel = seoulProjection.project([126.995, 37.518])
const regionLabels = SEOUL_POPULATION_SPOTS.map((region) => ({
  ...region,
  position: seoulProjection.project(region.point),
}))

const populationPixelOffsets = [
  [-12, -6],
  [-5, -12],
  [4, -12],
  [12, -6],
  [14, 2],
  [8, 10],
  [-1, 13],
  [-10, 9],
  [-14, 1],
] as const

const populationColors: Record<SeoulCongestionLevel, string> = {
  여유: "#2563eb",
  보통: "#7377dc",
  "약간 붐빔": "#f97316",
  붐빔: "#dc2626",
}

const placeCatalog: readonly Place[] = seoulPlaces

const placeDistrictIndex = new Map(
  placeCatalog.map((place) => [
    place.id,
    findContainingFeature(
      [place.location.lng, place.location.lat],
      seoulGuBoundaries,
    ),
  ]),
)

const freeContentByDistrict = new Map<number, number>()
for (const place of placeCatalog) {
  if (place.price.kind !== "free") continue
  const districtIndex = placeDistrictIndex.get(place.id) ?? -1
  if (districtIndex < 0) continue
  freeContentByDistrict.set(
    districtIndex,
    (freeContentByDistrict.get(districtIndex) ?? 0) + 1,
  )
}

const freeDistricts = new Set(freeContentByDistrict.keys())

function toPosition(point: GeoPoint): GeoPosition {
  return [point.lng, point.lat]
}

function districtForPoint(point: GeoPoint) {
  const index = findContainingFeature(toPosition(point), seoulGuBoundaries)
  return {
    index,
    properties:
      index >= 0 ? seoulGuBoundaries.features[index].properties : undefined,
  }
}

function nearestUnusedDot(
  point: GeoPoint,
  usedDots: (typeof seoulDots)[number][],
) {
  const projected = seoulProjection.project(toPosition(point))
  const districtIndex = findContainingFeature(toPosition(point), seoulGuBoundaries)

  for (const minimumSpacing of [42, 30, 0]) {
    let nearest: (typeof seoulDots)[number] | undefined
    let nearestDistance = Number.POSITIVE_INFINITY

    for (const dot of seoulDots) {
      if (districtIndex >= 0 && dot.featureIndex !== districtIndex) continue
      if (usedDots.some((used) => used.id === dot.id)) continue
      if (
        usedDots.some(
          (used) =>
            (used.x - dot.x) ** 2 + (used.y - dot.y) ** 2 <
            minimumSpacing ** 2,
        )
      ) {
        continue
      }
      const distance = (dot.x - projected.x) ** 2 + (dot.y - projected.y) ** 2
      if (distance < nearestDistance) {
        nearest = dot
        nearestDistance = distance
      }
    }

    if (nearest) return nearest
  }

  return undefined
}

function stopDots(stops: readonly PlannedStop[]) {
  const usedDots: (typeof seoulDots)[number][] = []
  return stops.flatMap((stop, index) => {
    const dot = nearestUnusedDot(stop.place.location, usedDots)
    if (!dot) return []
    usedDots.push(dot)
    return [{ stop, index, dot }]
  })
}

function isoDate(value: string | Date) {
  return typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10)
}

function eventIsOnDate(stop: PlannedStop, date: string | Date) {
  if (!stop.place.event) return false
  const target = isoDate(date)
  return target >= stop.place.event.startDate && target <= stop.place.event.endDate
}

function districtName(properties?: SeoulGuProperties) {
  return properties?.name ?? "서울"
}

function compactDuration(minutes: number) {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest}분`
  return rest ? `${hours}시간 ${rest}분` : `${hours}시간`
}

function compactPopulation(point: SeoulPopulationPoint) {
  const { populationMin: min, populationMax: max } = point
  if (max >= 10_000) return `${(min / 10_000).toFixed(1)}–${(max / 10_000).toFixed(1)}만명`
  if (max >= 1_000) return `${(min / 1_000).toFixed(1)}–${(max / 1_000).toFixed(1)}천명`
  return `${min.toLocaleString("ko-KR")}–${max.toLocaleString("ko-KR")}명`
}

function formatPopulationTime(value: string) {
  const match = value.match(/^\d{4}-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/)
  return match ? `${match[1]}.${match[2]} ${match[3]}` : value
}

function populationTimeRange(points: readonly SeoulPopulationPoint[]) {
  const times = [...new Set(points.map((point) => point.dataTime).filter(Boolean))].sort()
  if (times.length === 0) return null
  const first = formatPopulationTime(times[0])
  const last = formatPopulationTime(times.at(-1)!)
  return first === last ? `${last} 기준` : `${first}–${last.slice(6)} 기준`
}

interface SeoulDotMapProps {
  plan: TripPlan
  activeStopId: string
  onActiveStopChange: (id: string) => void
  className?: string
}

export function SeoulDotMap({
  plan,
  activeStopId,
  onActiveStopChange,
  className,
}: SeoulDotMapProps) {
  const {
    data: populationData,
    loading: populationLoading,
    error: populationError,
    refresh: refreshPopulation,
  } = useSeoulPopulation()
  const populationByCode = new Map(
    populationData?.points.map((point) => [point.areaCode, point]) ?? [],
  )
  const populationTime = populationTimeRange(populationData?.points ?? [])
  const populationIsStale = Boolean(populationError && populationData?.points.length)
  const markers = stopDots(plan.stops)
  const routeDistricts = new Set(
    plan.stops
      .map((stop) => districtForPoint(stop.place.location).index)
      .filter((index) => index >= 0),
  )
  const routeFreeContentByDistrict = new Map<number, number>()
  for (const stop of plan.stops) {
    if (stop.place.price.kind !== "free") continue
    const districtIndex = districtForPoint(stop.place.location).index
    if (districtIndex < 0) continue
    routeFreeContentByDistrict.set(
      districtIndex,
      (routeFreeContentByDistrict.get(districtIndex) ?? 0) + 1,
    )
  }
  const routeFreeDistricts = new Set(routeFreeContentByDistrict.keys())
  const activeMarker =
    markers.find(({ stop }) => stop.place.id === activeStopId) ?? markers[0]
  const activeDistrict = activeMarker
    ? seoulGuBoundaries.features[activeMarker.dot.featureIndex]?.properties
    : undefined
  const activeFreeCount = activeMarker
    ? routeFreeContentByDistrict.get(activeMarker.dot.featureIndex) ?? 0
    : 0
  const todayEventCount = activeMarker
    ? plan.stops.filter(
        (stop) =>
          districtForPoint(stop.place.location).index === activeMarker.dot.featureIndex &&
          eventIsOnDate(stop, plan.request.date),
      ).length
    : 0
  const routeDots = dottedPolyline(
    markers.map(({ dot }) => ({ x: dot.x, y: dot.y })),
    9,
  )
  const firstStop = plan.stops[0]
  const lastStop = plan.stops.at(-1)
  const journeyWindow =
    firstStop && lastStop
      ? `${firstStop.startTime} — ${lastStop.departTime}`
      : `${plan.request.startTime} — ${plan.request.endTime}`
  const populationStatusText = populationLoading
    ? "실시간 인구 불러오는 중"
    : populationIsStale
      ? `갱신 실패 · ${populationTime ?? "이전"} 데이터 표시`
      : populationError
        ? "실시간 인구 연결 안 됨"
      : populationTime
        ? `${populationTime} · ${populationData?.status === "sample" ? "광화문 샘플" : "서울 주요 거점"}`
        : "실시간 인구 기준 시각 없음"

  return (
    <figure
      id="course-map"
      className={cn(
        "scroll-mt-20 w-full min-w-0 max-w-full overflow-hidden rounded-3xl border border-foreground/10 bg-[#f3f5ef] shadow-[0_24px_80px_rgba(22,52,37,0.10)]",
        className,
      )}
      aria-labelledby="seoul-dot-map-title"
    >
      <div className="border-b border-white/10 bg-[#183d2f] px-4 py-3 text-white sm:hidden">
        <div className="flex items-center gap-2 text-[9px] font-bold tracking-[0.16em] text-white/62">
          <span className="size-1.5 animate-pulse rounded-full bg-[#c9ff45]" />
          LIVE JOURNEY · SEOUL
        </div>
        <div className="mt-1 flex min-w-0 items-center justify-between gap-3">
          <h3 id="seoul-dot-map-title-mobile" className="truncate text-sm font-bold">
            {plan.title}
          </h3>
          <span className="shrink-0 text-[10px] text-white/72">{plan.stops.length}개 스톱</span>
        </div>
        <div className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[9px] text-white/68" aria-live="polite">
          <Activity className={cn("size-3 shrink-0", !populationError && "text-[#7fb0ff]")} />
          <span className="truncate">{populationStatusText}</span>
          <button
            type="button"
            onClick={() => void refreshPopulation()}
            disabled={populationLoading}
            className="ml-auto grid size-6 shrink-0 place-items-center rounded-md text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-45"
            aria-label="실시간 인구 새로고침"
          >
            <RefreshCw className={cn("size-3", populationLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      <div className="relative aspect-[45/26] w-full overflow-hidden" data-testid="seoul-dot-map">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_50%_42%,rgba(255,255,255,.92),rgba(242,245,238,.56)_52%,rgba(221,230,220,.72))]"
        />

        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 size-full"
          role="img"
          aria-labelledby="seoul-dot-map-svg-title seoul-dot-map-svg-desc"
        >
          <title id="seoul-dot-map-svg-title">서울 실시간 인구와 추천 코스 점 지도</title>
          <desc id="seoul-dot-map-svg-desc">
            실제 행정경계 안쪽을 같은 간격의 원으로 채우고, 한강과 주요 지역의 실시간 인구 혼잡도, 일정의 방문 위치를 표시한 지도입니다.
          </desc>

          <g aria-hidden="true">
            {seoulDots.map((dot) => {
              const onRoute = routeDistricts.has(dot.featureIndex)
              const hasFreeContent = routeFreeDistricts.has(dot.featureIndex)
              return (
                <circle
                  key={dot.id}
                  cx={dot.x}
                  cy={dot.y}
                  r={DOT_RADIUS}
                  fill={
                    onRoute
                      ? "oklch(0.62 0.055 148)"
                      : hasFreeContent
                        ? "oklch(0.76 0.035 145)"
                        : "oklch(0.86 0.012 95)"
                  }
                  opacity={onRoute ? 0.92 : hasFreeContent ? 0.8 : 0.9}
                />
              )
            })}
          </g>

          <g aria-hidden="true">
            {hanRiverDots.map((dot, index) => (
              <circle
                key={`river-${index}`}
                cx={dot.x}
                cy={dot.y}
                r={3.35}
                fill="oklch(0.68 0.105 226)"
                opacity={0.92}
              />
            ))}
            <g transform={`translate(${hanRiverLabel.x} ${hanRiverLabel.y})`}>
              <rect
                x={-42}
                y={-10}
                width={84}
                height={20}
                rx={4}
                fill="oklch(0.955 0.025 225 / 0.94)"
                stroke="oklch(0.68 0.105 226 / 0.45)"
              />
              <text
                y={0.5}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="oklch(0.39 0.09 225)"
                fontSize={9.5}
                fontWeight={800}
                letterSpacing={0.8}
              >
                한강 · HANGANG
              </text>
            </g>
          </g>

          <g aria-hidden="true">
            {regionLabels.map(({ areaCode, areaName, label, position }) => {
              const population = populationByCode.get(areaCode)
              const color = population
                ? populationColors[population.congestionLevel]
                : "oklch(0.55 0.02 150)"

              return (
                <g key={areaCode} transform={`translate(${position.x} ${position.y})`}>
                  <title>
                    {population
                      ? `${areaName}: ${compactPopulation(population)}, ${population.congestionLevel}, ${formatPopulationTime(population.dataTime)} 기준`
                      : `${areaName}: 실시간 데이터 대기`}
                  </title>
                  {population ? (
                    <>
                      {populationPixelOffsets.map(([x, y], index) => (
                        <circle
                          key={`${areaCode}-population-${index}`}
                          cx={x}
                          cy={y}
                          r={2.7}
                          fill={color}
                          opacity={0.78}
                        />
                      ))}
                      <circle
                        r={17}
                        fill={color}
                        fillOpacity={0.07}
                        stroke={color}
                        strokeWidth={1.4}
                        strokeDasharray="2 3"
                      />
                      <circle r={4.2} fill={color} stroke="#f3f5ef" strokeWidth={2} />
                    </>
                  ) : (
                    <circle r={2.2} fill={color} opacity={0.5} />
                  )}

                  <g className="hidden sm:block">
                    {population ? (
                      <rect
                        x={-48}
                        y={-38}
                        width={96}
                        height={25}
                        rx={5}
                        fill="#fbfcf9"
                        fillOpacity={0.94}
                        stroke={color}
                        strokeOpacity={0.42}
                      />
                    ) : null}
                    <text
                      x={0}
                      y={population ? -28 : -8}
                      textAnchor="middle"
                      fill="oklch(0.24 0.04 153)"
                      stroke="#f3f5ef"
                      strokeWidth={population ? 0 : 4.5}
                      paintOrder="stroke"
                      fontSize={10.5}
                      fontWeight={800}
                      letterSpacing={-0.2}
                    >
                      {label}
                    </text>
                    {population ? (
                      <text
                        x={0}
                        y={-18}
                        textAnchor="middle"
                        fill={color}
                        fontSize={7.6}
                        fontWeight={800}
                      >
                        {compactPopulation(population)} · {population.congestionLevel}
                      </text>
                    ) : null}
                  </g>
                </g>
              )
            })}
          </g>

          <g aria-hidden="true">
            {routeDots.map((dot, index) => (
              <circle
                key={`route-${index}`}
                cx={dot.x}
                cy={dot.y}
                r={2.35}
                fill="oklch(0.27 0.08 154)"
                stroke="#f3f5ef"
                strokeWidth={1.2}
              />
            ))}
          </g>

          <g aria-hidden="true">
            {markers.map(({ stop, index, dot }) => {
              const active = stop.place.id === activeStopId
              const todayEvent = eventIsOnDate(stop, plan.request.date)
              return (
                <g key={stop.place.id}>
                  {active ? (
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={13}
                      fill="none"
                      stroke="oklch(0.34 0.085 155)"
                      strokeWidth={2}
                    />
                  ) : null}
                  {todayEvent ? (
                    <circle
                      cx={dot.x}
                      cy={dot.y}
                      r={9.5}
                      fill="none"
                      stroke="oklch(0.63 0.12 125)"
                      strokeWidth={2}
                    />
                  ) : null}
                  <circle
                    cx={dot.x}
                    cy={dot.y}
                    r={active ? 8.5 : 7}
                    fill={todayEvent ? "oklch(0.91 0.14 125)" : "oklch(0.30 0.075 155)"}
                    stroke="#f8f7f4"
                    strokeWidth={3}
                  />
                  <text
                    x={dot.x}
                    y={dot.y + 0.6}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={todayEvent ? "oklch(0.25 0.06 145)" : "#ffffff"}
                    fontSize={8.5}
                    fontWeight={700}
                  >
                    {index + 1}
                  </text>
                </g>
              )
            })}
          </g>
        </svg>

        <div className="pointer-events-none absolute inset-x-5 top-5 z-20 hidden items-start justify-between gap-3 sm:flex">
          <div className="max-w-[min(76%,430px)] rounded-2xl border border-white/60 bg-[#183d2f]/94 px-5 py-4 text-white shadow-[0_14px_40px_rgba(18,49,37,.20)] backdrop-blur-md">
            <div className="flex items-center gap-2 text-[9px] font-bold tracking-[0.18em] text-white/62 sm:text-[10px]">
              <span className="size-1.5 animate-pulse rounded-full bg-[#c9ff45]" />
              LIVE JOURNEY · SEOUL
            </div>
            <h3
              id="seoul-dot-map-title"
              className="mt-1.5 truncate text-sm font-bold tracking-[-0.025em] sm:mt-2 sm:text-xl"
            >
              {plan.title}
            </h3>
            <div className="mt-2 hidden flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-white/72 sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <Route className="size-3.5 text-[#c9ff45]" /> {plan.stops.length}개 스톱
              </span>
              <span className="tabular-nums">{journeyWindow}</span>
              <span>{compactDuration(plan.totals.durationMinutes)}</span>
            </div>
            <div
              className="mt-2.5 flex min-w-0 items-center gap-1.5 border-t border-white/12 pt-2 text-[9px] text-white/68 sm:text-[10px]"
              aria-live="polite"
            >
              <Activity className={cn("size-3 shrink-0", !populationError && "text-[#7fb0ff]")} />
              <span className="truncate">{populationStatusText}</span>
              <button
                type="button"
                onClick={() => void refreshPopulation()}
                disabled={populationLoading}
                className="pointer-events-auto ml-auto grid size-6 shrink-0 place-items-center rounded-md text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-45"
                aria-label="실시간 인구 새로고침"
              >
                <RefreshCw className={cn("size-3", populationLoading && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="hidden min-w-52 rounded-2xl border border-foreground/10 bg-white/90 px-4 py-3 shadow-[0_12px_30px_rgba(25,55,40,.10)] backdrop-blur-md md:block">
            <p className="flex items-center justify-between gap-4 text-[9px] font-bold tracking-[0.16em] text-muted-foreground">
              <span>ACTIVE STOP</span>
              <span className="text-primary">{activeMarker ? String(activeMarker.index + 1).padStart(2, "0") : "--"}</span>
            </p>
            <p className="mt-2 max-w-60 truncate text-sm font-bold">
              {activeMarker?.stop.place.name ?? "일정을 선택하세요"}
            </p>
            <p className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <MapPin className="size-3 text-primary" />
              {districtName(activeDistrict)}
              {activeMarker ? ` · ${activeMarker.stop.startTime}–${activeMarker.stop.departTime}` : null}
            </p>
          </div>
        </div>

        {markers.map(({ stop, index, dot }) => {
          const active = stop.place.id === activeStopId
          return (
            <button
              type="button"
              key={stop.place.id}
              aria-label={`${index + 1}번 ${stop.place.name} 선택`}
              aria-pressed={active}
              onClick={() => onActiveStopChange(stop.place.id)}
              onMouseEnter={() => onActiveStopChange(stop.place.id)}
              onFocus={() => onActiveStopChange(stop.place.id)}
              className="absolute z-10 size-12 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none transition-transform duration-200 hover:scale-[1.08] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#f3f5ef]"
              style={{
                left: `${(dot.x / MAP_WIDTH) * 100}%`,
                top: `${(dot.y / MAP_HEIGHT) * 100}%`,
              }}
            />
          )
        })}

        <div className="absolute inset-x-5 bottom-5 z-20 hidden sm:block">
          <div className="rounded-2xl border border-white/60 bg-[#fbfcf8]/92 p-2 shadow-[0_16px_44px_rgba(20,52,37,.14)] backdrop-blur-lg">
            <div className="mb-1.5 flex items-center justify-between px-2 pt-1 text-[9px] font-bold tracking-[0.15em] text-muted-foreground">
              <span>JOURNEY HUD · 일정 순서</span>
              <span className="inline-flex items-center gap-1.5">
                <Footprints className="size-3" /> {Math.round(plan.totals.walkingMeters / 100) / 10}km
              </span>
            </div>
            <ol className="flex gap-1.5 overflow-x-auto pb-0.5" aria-label="지도 위 여행 일정">
              {markers.map(({ stop, index }) => {
                const active = stop.place.id === activeStopId
                return (
                  <li key={stop.place.id} className="min-w-36 flex-1 lg:min-w-0">
                    <button
                      type="button"
                      onClick={() => onActiveStopChange(stop.place.id)}
                      onMouseEnter={() => onActiveStopChange(stop.place.id)}
                      onFocus={() => onActiveStopChange(stop.place.id)}
                      aria-pressed={active}
                      aria-current={active ? "step" : undefined}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/45",
                        active
                          ? "bg-primary text-primary-foreground"
                          : "bg-white/55 text-foreground hover:bg-white",
                      )}
                    >
                      <span
                        className={cn(
                          "grid size-7 shrink-0 place-items-center rounded-lg text-[10px] font-extrabold",
                          active ? "bg-[#c9ff45] text-[#183d2f]" : "bg-secondary text-primary",
                        )}
                      >
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("tabular-nums block text-[9px]", active ? "text-white/62" : "text-muted-foreground")}>
                          {stop.startTime}—{stop.departTime}
                        </span>
                        <span className="mt-0.5 block truncate text-[11px] font-bold">{stop.place.name}</span>
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>

      <div className="border-t border-border/80 bg-[#fbfcf9] px-4 py-3.5 sm:px-5" aria-live="polite">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-primary">
              {districtName(activeDistrict)} · {activeMarker ? `${activeMarker.index + 1}번째 여정` : "여정"}
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {activeMarker?.stop.place.name ?? "점을 눌러 일정을 살펴보세요"}
            </p>
          </div>
          <div className="shrink-0 text-right text-[10px] leading-5 text-muted-foreground">
            <p>코스 내 무료 {activeFreeCount}곳</p>
            <p>코스 내 오늘 행사 {todayEventCount}개</p>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-border/80 bg-white px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-2.5">
            <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-[#e9efff] text-[#2563eb]">
              <Activity className="size-3.5" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold text-foreground">서울시 실시간 인구</p>
              <p className="mt-0.5 truncate text-[9px] text-muted-foreground">
                {populationLoading
                  ? "주요 거점 데이터를 불러오고 있어요."
                  : populationIsStale
                    ? `새로고침 실패 · ${populationTime ?? "이전 기준"} 데이터를 유지하고 있어요.`
                    : populationError
                      ? populationError
                    : populationData?.message ?? `공식 혼잡도 기준 · 주요 ${populationData?.points.length ?? 0}개 거점`}
              </p>
            </div>
          </div>
          <p className="tabular-nums shrink-0 text-[10px] font-bold text-primary">
            {populationTime ?? (populationLoading ? "갱신 중" : "기준 시각 없음")}
          </p>
        </div>

        {populationData?.points.length ? (
          <ul className="sr-only" aria-label="서울 주요 지역 실시간 인구">
            {populationData.points.map((point) => (
              <li key={point.areaCode}>
                {point.label} {compactPopulation(point)}, 혼잡도 {point.congestionLevel}, {formatPopulationTime(point.dataTime)} 기준
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-muted-foreground" aria-label="지도 범례">
          <LegendDot color="oklch(0.86 0.012 95)" label="기본 지역" />
          <LegendDot color="oklch(0.76 0.035 145)" label="코스 내 무료" />
          <LegendDot color="oklch(0.68 0.105 226)" label="한강" />
          <LegendDot color="#2563eb" label="여유 · 낮음" />
          <LegendDot color="#7377dc" label="보통" />
          <LegendDot color="#f97316" label="약간 붐빔" />
          <LegendDot color="#dc2626" label="붐빔 · 높음" />
          <LegendDot color="oklch(0.30 0.075 155)" label="추천 일정" />
          <LegendDot color="oklch(0.91 0.14 125)" ring label="오늘 행사" />
        </div>

        <figcaption className="mt-3 flex min-w-0 flex-col items-start gap-1 border-t border-border/70 pt-2.5 text-[9px] leading-4 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <span>통신 데이터 기반 추정치 · 지점별 실제 현장 인원과 차이가 날 수 있어요.</span>
          <span className="flex flex-wrap gap-x-3 gap-y-1">
            <a
              href={SEOUL_POPULATION_SOURCE.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1 underline decoration-border underline-offset-2 hover:text-foreground"
            >
              인구 데이터 · 서울특별시
              <ExternalLink className="size-2.5" />
            </a>
            <a
              href={SEOUL_BOUNDARY_SOURCE.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 items-center gap-1 underline decoration-border underline-offset-2 hover:text-foreground"
              title={`${SEOUL_BOUNDARY_SOURCE.label} · ${SEOUL_BOUNDARY_SOURCE.license}`}
            >
              지도 경계 · {SEOUL_BOUNDARY_SOURCE.license}
              <ExternalLink className="size-2.5" />
            </a>
          </span>
        </figcaption>
      </div>
    </figure>
  )
}

function LegendDot({
  color,
  label,
  ring = false,
}: {
  color: string
  label: string
  ring?: boolean
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={cn(
          "size-2 rounded-full",
          ring && "ring-1 ring-primary/70 ring-offset-1 ring-offset-[#f8f7f4]",
        )}
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      {label}
    </span>
  )
}

interface SeoulDotSilhouetteProps {
  origin?: GeoPoint
  className?: string
}

export function SeoulDotSilhouette({ origin, className }: SeoulDotSilhouetteProps) {
  const originDistrict = origin ? districtForPoint(origin).index : -1

  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      preserveAspectRatio="xMidYMid meet"
      className={className}
      role="img"
      aria-label="실제 서울 행정경계를 점으로 표현한 지도"
    >
      {seoulDots.map((dot) => (
        <circle
          key={dot.id}
          cx={dot.x}
          cy={dot.y}
          r={DOT_RADIUS}
          fill={
            dot.featureIndex === originDistrict
              ? "oklch(0.91 0.14 125)"
              : freeDistricts.has(dot.featureIndex)
                ? "oklch(0.72 0.045 145)"
                : "oklch(0.84 0.012 95)"
          }
        />
      ))}
    </svg>
  )
}
