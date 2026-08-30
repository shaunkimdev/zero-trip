import { Activity, ExternalLink, RefreshCw, Route } from "lucide-react"

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

const projectedHanRiver = HAN_RIVER_CENTERLINE.map((point) =>
  seoulProjection.project(point),
)

function distanceToSegment(
  point: ScreenPoint,
  from: ScreenPoint,
  to: ScreenPoint,
) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const segmentLengthSquared = dx * dx + dy * dy
  if (segmentLengthSquared === 0) return Math.hypot(point.x - from.x, point.y - from.y)

  const progress = Math.max(
    0,
    Math.min(
      1,
      ((point.x - from.x) * dx + (point.y - from.y) * dy) /
        segmentLengthSquared,
    ),
  )
  return Math.hypot(
    point.x - (from.x + dx * progress),
    point.y - (from.y + dy * progress),
  )
}

function distanceToPolyline(point: ScreenPoint, line: readonly ScreenPoint[]) {
  let nearestDistance = Number.POSITIVE_INFINITY
  for (let index = 0; index < line.length - 1; index += 1) {
    nearestDistance = Math.min(
      nearestDistance,
      distanceToSegment(point, line[index], line[index + 1]),
    )
  }
  return nearestDistance
}

// The river is represented by the existing atlas pixels it crosses. This keeps
// its dots on exactly the same grid as every other point in the Seoul silhouette.
const hanRiverPixelIds = new Set(
  seoulDots
    .filter((dot) => distanceToPolyline(dot, projectedHanRiver) <= DOT_SPACING * 0.82)
    .map((dot) => dot.id),
)
const hanRiverLabelTarget = seoulProjection.project([126.995, 37.518])
const hanRiverLabelAnchor = [...seoulDots]
  .filter((dot) => hanRiverPixelIds.has(dot.id))
  .sort(
    (left, right) =>
      (left.x - hanRiverLabelTarget.x) ** 2 +
      (left.y - hanRiverLabelTarget.y) ** 2 -
      ((right.x - hanRiverLabelTarget.x) ** 2 +
        (right.y - hanRiverLabelTarget.y) ** 2),
  )[0]

const neighboringGridOffsets = [
  [0, -1],
  [-1, 0],
  [1, 0],
  [0, 1],
] as const
const seoulDotById = new Map(seoulDots.map((dot) => [dot.id, dot]))
const districtBoundaryPixelIds = new Set<string>()

for (const dot of seoulDots) {
  const touchesBoundary = neighboringGridOffsets.some(([column, row]) => {
    const neighborId = `${Math.round(dot.x + column * DOT_SPACING)}-${Math.round(dot.y + row * DOT_SPACING)}`
    const neighbor = seoulDotById.get(neighborId)
    return !neighbor || neighbor.featureIndex !== dot.featureIndex
  })
  if (touchesBoundary) districtBoundaryPixelIds.add(dot.id)
}

const districtLabels = seoulGuBoundaries.features.flatMap((feature, featureIndex) => {
  const dots = seoulDots.filter((dot) => dot.featureIndex === featureIndex)
  if (dots.length === 0) return []
  const center = {
    x: dots.reduce((sum, dot) => sum + dot.x, 0) / dots.length,
    y: dots.reduce((sum, dot) => sum + dot.y, 0) / dots.length,
  }
  const candidates = dots.filter(
    (dot) =>
      !districtBoundaryPixelIds.has(dot.id) && !hanRiverPixelIds.has(dot.id),
  )
  const anchor = (candidates.length ? candidates : dots).sort(
    (left, right) =>
      (left.x - center.x) ** 2 +
      (left.y - center.y) ** 2 -
      ((right.x - center.x) ** 2 + (right.y - center.y) ** 2),
  )[0]

  return [{
    featureIndex,
    name: feature.properties.name,
    x: anchor.x,
    y: anchor.y,
  }]
})

const populationRegions = SEOUL_POPULATION_SPOTS.map((region) => {
  const projectedPosition = seoulProjection.project(region.point)
  const anchor = [...seoulDots]
    .filter(
      (dot) =>
        !hanRiverPixelIds.has(dot.id) && !districtBoundaryPixelIds.has(dot.id),
    )
    .sort(
      (left, right) =>
        (left.x - projectedPosition.x) ** 2 +
        (left.y - projectedPosition.y) ** 2 -
        ((right.x - projectedPosition.x) ** 2 +
          (right.y - projectedPosition.y) ** 2),
    )[0]

  return {
    ...region,
    position: projectedPosition,
    anchor: anchor ?? projectedPosition,
  }
})

const congestionScalePosition: Record<SeoulCongestionLevel, number> = {
  여유: 0,
  보통: 0.34,
  "약간 붐빔": 0.68,
  붐빔: 1,
}
const populationColorStops = [
  { position: 0, color: [37, 99, 235] },
  { position: 0.28, color: [6, 182, 212] },
  { position: 0.55, color: [250, 204, 21] },
  { position: 0.77, color: [249, 115, 22] },
  { position: 1, color: [220, 38, 38] },
] as const

function populationScaleColor(position: number) {
  const normalized = Math.max(0, Math.min(1, position))
  const upperIndex = populationColorStops.findIndex(
    (stop) => stop.position >= normalized,
  )
  if (upperIndex <= 0) {
    const [red, green, blue] = populationColorStops[0].color
    return `rgb(${red}, ${green}, ${blue})`
  }
  const lower = populationColorStops[upperIndex - 1]
  const upper = populationColorStops[upperIndex]
  const progress =
    (normalized - lower.position) / (upper.position - lower.position)
  const color = lower.color.map((channel, index) =>
    Math.round(channel + (upper.color[index] - channel) * progress),
  )
  return `rgb(${color[0]}, ${color[1]}, ${color[2]})`
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

const COURSE_CALLOUT_WIDTH = 122
const COURSE_CALLOUT_HEIGHT = 24
const COURSE_CALLOUT_SIDE_GUTTER = 142

interface LabelBox {
  x: number
  y: number
  width: number
  height: number
}

function labelBoxesOverlap(left: LabelBox, right: LabelBox, gap = 7) {
  return !(
    left.x + left.width + gap <= right.x ||
    right.x + right.width + gap <= left.x ||
    left.y + left.height + gap <= right.y ||
    right.y + right.height + gap <= left.y
  )
}

function compactPlaceName(name: string) {
  const characters = Array.from(name)
  return characters.length > 11 ? `${characters.slice(0, 10).join("")}…` : name
}

function layoutCourseCallouts(markers: ReturnType<typeof stopDots>) {
  const placed: LabelBox[] = []

  return markers.map((marker, index) => {
    const preferLeft = index % 2 === 1
    const leftX = marker.dot.x - COURSE_CALLOUT_WIDTH - 27
    const rightX = marker.dot.x + 27
    const candidateOffsets = preferLeft
      ? [
          { x: leftX, y: marker.dot.y - 36 },
          { x: leftX, y: marker.dot.y + 13 },
          { x: rightX, y: marker.dot.y - 36 },
          { x: rightX, y: marker.dot.y + 13 },
          { x: marker.dot.x - COURSE_CALLOUT_WIDTH / 2, y: marker.dot.y - 58 },
          { x: marker.dot.x - COURSE_CALLOUT_WIDTH / 2, y: marker.dot.y + 32 },
        ]
      : [
          { x: rightX, y: marker.dot.y - 36 },
          { x: rightX, y: marker.dot.y + 13 },
          { x: leftX, y: marker.dot.y - 36 },
          { x: leftX, y: marker.dot.y + 13 },
          { x: marker.dot.x - COURSE_CALLOUT_WIDTH / 2, y: marker.dot.y - 58 },
          { x: marker.dot.x - COURSE_CALLOUT_WIDTH / 2, y: marker.dot.y + 32 },
        ]
    const candidates = candidateOffsets.map(({ x, y }) => ({
      x: Math.max(
        COURSE_CALLOUT_SIDE_GUTTER,
        Math.min(MAP_WIDTH - COURSE_CALLOUT_SIDE_GUTTER - COURSE_CALLOUT_WIDTH, x),
      ),
      y: Math.max(14, Math.min(MAP_HEIGHT - COURSE_CALLOUT_HEIGHT - 14, y)),
      width: COURSE_CALLOUT_WIDTH,
      height: COURSE_CALLOUT_HEIGHT,
    }))
    const selected =
      candidates.find(
        (candidate) =>
          !placed.some((box) => labelBoxesOverlap(candidate, box)) &&
          !markers.some(
            (other) =>
              other.stop.place.id !== marker.stop.place.id &&
              other.dot.x >= candidate.x - 10 &&
              other.dot.x <= candidate.x + candidate.width + 10 &&
              other.dot.y >= candidate.y - 10 &&
              other.dot.y <= candidate.y + candidate.height + 10,
          ),
      ) ?? candidates[index % candidates.length]
    placed.push(selected)

    const connectorStart = {
      x: Math.max(selected.x, Math.min(selected.x + selected.width, marker.dot.x)),
      y: Math.max(selected.y, Math.min(selected.y + selected.height, marker.dot.y)),
    }
    const dx = marker.dot.x - connectorStart.x
    const dy = marker.dot.y - connectorStart.y
    const length = Math.hypot(dx, dy) || 1

    return {
      ...marker,
      label: compactPlaceName(marker.stop.place.name),
      box: selected,
      connectorStart,
      connectorEnd: {
        x: marker.dot.x - (dx / length) * 11,
        y: marker.dot.y - (dy / length) * 11,
      },
    }
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
  const populationPoints = populationData?.points ?? []
  const populationValues = populationPoints.map(
    (point) => (point.populationMin + point.populationMax) / 2,
  )
  const minimumPopulation = Math.min(...populationValues)
  const maximumPopulation = Math.max(...populationValues)
  const populationRange = maximumPopulation - minimumPopulation
  const populationVisualByCode = new Map(
    populationPoints.map((point) => {
      const value = (point.populationMin + point.populationMax) / 2
      const scalePosition =
        Number.isFinite(populationRange) && populationRange > 0
          ? (value - minimumPopulation) / populationRange
          : congestionScalePosition[point.congestionLevel]
      return [
        point.areaCode,
        {
          point,
          scalePosition,
          color: populationScaleColor(scalePosition),
          radius: 39 + scalePosition * 19,
        },
      ] as const
    }),
  )
  const populationTime = populationTimeRange(populationPoints)
  const populationIsStale = Boolean(populationError && populationData?.points.length)
  const markers = stopDots(plan.stops)
  const courseCallouts = layoutCourseCallouts(markers)
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
  const routeSegments = markers.slice(1).map((marker, index) => {
    const from = markers[index].dot
    const to = marker.dot
    return {
      from,
      to,
      midpoint: {
        x: from.x + (to.x - from.x) * 0.52,
        y: from.y + (to.y - from.y) * 0.52,
      },
      angle: (Math.atan2(to.y - from.y, to.x - from.x) * 180) / Math.PI,
    }
  })
  const populationPixelStyles = new Map<
    string,
    { color: string; opacity: number; influence: number }
  >()
  for (const region of populationRegions) {
    const visual = populationVisualByCode.get(region.areaCode)
    if (!visual) continue

    for (const dot of seoulDots) {
      if (
        hanRiverPixelIds.has(dot.id) ||
        districtBoundaryPixelIds.has(dot.id)
      ) {
        continue
      }
      const distance = Math.hypot(
        dot.x - region.anchor.x,
        dot.y - region.anchor.y,
      )
      if (distance > visual.radius) continue
      const influence = 1 - distance / visual.radius
      const current = populationPixelStyles.get(dot.id)
      if (current && current.influence >= influence) continue
      populationPixelStyles.set(dot.id, {
        color: visual.color,
        opacity: 0.34 + influence * 0.66,
        influence,
      })
    }
  }
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
        "scroll-mt-20 w-full min-w-0 max-w-full overflow-hidden rounded-[2rem] bg-[#f3f3f1] shadow-[0_26px_75px_rgba(0,0,0,.11),0_8px_24px_rgba(0,0,0,.055)]",
        className,
      )}
      aria-labelledby="seoul-dot-map-title"
    >
      <div className="bg-black px-4 py-3.5 text-white sm:px-5 sm:py-4">
        <div className="flex min-w-0 items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[9px] font-bold tracking-[0.16em] text-white/62 sm:text-[10px]">
              <span className="size-1.5 animate-pulse rounded-full bg-white" />
              LIVE JOURNEY · SEOUL
            </div>
            <h3
              id="seoul-dot-map-title"
              className="mt-1 truncate text-sm font-bold tracking-[-0.025em] sm:text-lg"
            >
              {plan.title}
            </h3>
            <div
              className="mt-1.5 flex min-w-0 items-center gap-1.5 text-[9px] text-white/68 sm:text-[10px]"
              aria-live="polite"
            >
              <Activity className={cn("size-3 shrink-0", !populationError && "text-[#7fb0ff]")} />
              <span className="truncate">{populationStatusText}</span>
              <button
                type="button"
                onClick={() => void refreshPopulation()}
                disabled={populationLoading}
                className="grid size-6 shrink-0 place-items-center rounded-md text-white/60 outline-none hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-45"
                aria-label="실시간 인구 새로고침"
              >
                <RefreshCw className={cn("size-3", populationLoading && "animate-spin")} />
              </button>
            </div>
          </div>

          <div className="hidden shrink-0 items-center gap-5 sm:flex">
            <div className="text-right text-[10px] leading-5 text-white/68">
              <p className="inline-flex items-center gap-1.5 font-semibold text-white">
                <Route className="size-3 text-white" /> {plan.stops.length}개 스톱
              </p>
              <p className="tabular-nums">{journeyWindow} · {compactDuration(plan.totals.durationMinutes)}</p>
            </div>
            <div className="max-w-52 pl-5">
              <p className="text-[9px] font-bold tracking-[0.14em] text-white/48">
                ACTIVE {activeMarker ? String(activeMarker.index + 1).padStart(2, "0") : "--"}
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold">
                {activeMarker?.stop.place.name ?? "일정을 선택하세요"}
              </p>
            </div>
          </div>
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
            서울 각 구를 회색 경계 픽셀과 반투명 구 이름으로 구분하고, 한강과 주요 지역의 실시간 유동인구 분포, 일정의 번호별 방문 위치를 표시한 지도입니다.
          </desc>

          <defs>
            <filter id="soft-map-card-shadow" x="-30%" y="-40%" width="160%" height="190%">
              <feDropShadow dx="0" dy="3" stdDeviation="3.2" floodColor="#111111" floodOpacity="0.13" />
            </filter>
            <marker
              id="course-callout-arrow"
              viewBox="0 0 8 8"
              refX={7}
              refY={4}
              markerWidth={5.5}
              markerHeight={5.5}
              orient="auto"
            >
              <path d="M 0 0 L 8 4 L 0 8 Z" fill="#171717" />
            </marker>
          </defs>

          <g aria-hidden="true">
            {seoulDots.map((dot) => {
              const hasFreeContent = routeFreeDistricts.has(dot.featureIndex)
              const populationStyle = populationPixelStyles.get(dot.id)
              const isRiverPixel = hanRiverPixelIds.has(dot.id)
              const isDistrictBoundary = districtBoundaryPixelIds.has(dot.id)
              return (
                <circle
                  key={dot.id}
                  cx={dot.x}
                  cy={dot.y}
                  r={DOT_RADIUS}
                  fill={
                    isRiverPixel
                      ? "#2185d5"
                      : isDistrictBoundary
                        ? "#8f9894"
                        : populationStyle
                          ? populationStyle.color
                      : hasFreeContent
                        ? "#b7b7b2"
                        : "oklch(0.86 0.012 95)"
                  }
                  opacity={
                    isRiverPixel || isDistrictBoundary
                      ? 1
                      : populationStyle
                        ? populationStyle.opacity
                        : hasFreeContent
                          ? 0.8
                          : 0.9
                  }
                />
              )
            })}
          </g>

          {hanRiverLabelAnchor ? (
            <g aria-hidden="true">
              <text
                x={hanRiverLabelAnchor.x}
                y={hanRiverLabelAnchor.y - 11}
                textAnchor="middle"
                fill="#1766a5"
                stroke="#f3f5ef"
                strokeWidth={4}
                paintOrder="stroke"
                fontSize={9}
                fontWeight={800}
                letterSpacing={1.2}
              >
                한강
              </text>
            </g>
          ) : null}

          <g aria-hidden="true" className="hidden sm:block">
            {districtLabels.map((district) => (
              <text
                key={district.featureIndex}
                x={district.x}
                y={district.y + 3}
                textAnchor="middle"
                fill="#111827"
                fillOpacity={0.56}
                stroke="#f3f5ef"
                strokeOpacity={0.74}
                strokeWidth={2.8}
                paintOrder="stroke"
                fontFamily={'"Pretendard Variable", Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif'}
                fontSize={9.5}
                fontWeight={700}
                letterSpacing={-0.45}
              >
                {district.name}
              </text>
            ))}
          </g>

          <g aria-hidden="true">
            {routeSegments.map((segment, index) => (
              <g key={`route-${index}`}>
                <line
                  x1={segment.from.x}
                  y1={segment.from.y}
                  x2={segment.to.x}
                  y2={segment.to.y}
                  stroke="#f8faf7"
                  strokeWidth={7}
                  strokeLinecap="round"
                />
                <line
                  x1={segment.from.x}
                  y1={segment.from.y}
                  x2={segment.to.x}
                  y2={segment.to.y}
                  stroke="#171717"
                  strokeWidth={2.7}
                  strokeLinecap="round"
                />
                <g
                  transform={`translate(${segment.midpoint.x} ${segment.midpoint.y}) rotate(${segment.angle})`}
                >
                  <path
                    d="M -3.5 -3.5 L 1 0 L -3.5 3.5"
                    fill="none"
                    stroke="#f8faf7"
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M -3.5 -3.5 L 1 0 L -3.5 3.5"
                    fill="none"
                    stroke="#171717"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </g>
              </g>
            ))}
          </g>

          <g aria-hidden="true" className="hidden sm:block">
            {courseCallouts.map((callout) => (
              <g key={`course-callout-${callout.stop.place.id}`}>
                <line
                  x1={callout.connectorStart.x}
                  y1={callout.connectorStart.y}
                  x2={callout.connectorEnd.x}
                  y2={callout.connectorEnd.y}
                  stroke="#f8faf7"
                  strokeWidth={4.5}
                  strokeLinecap="round"
                />
                <line
                  x1={callout.connectorStart.x}
                  y1={callout.connectorStart.y}
                  x2={callout.connectorEnd.x}
                  y2={callout.connectorEnd.y}
                  stroke="#171717"
                  strokeWidth={1.35}
                  strokeLinecap="round"
                  markerEnd="url(#course-callout-arrow)"
                />
                <g
                  transform={`translate(${callout.box.x} ${callout.box.y})`}
                  filter="url(#soft-map-card-shadow)"
                >
                  <rect
                    width={callout.box.width}
                    height={callout.box.height}
                    rx={7}
                    fill="#fbfcf9"
                    fillOpacity={0.94}
                  />
                  <rect
                    x={3}
                    y={3}
                    width={18}
                    height={18}
                    rx={5}
                    fill="#171717"
                  />
                  <text
                    x={12}
                    y={12.5}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="#ffffff"
                    fontSize={7.5}
                    fontWeight={800}
                  >
                    {String(callout.index + 1).padStart(2, "0")}
                  </text>
                  <text
                    x={27}
                    y={12.8}
                    dominantBaseline="middle"
                    fill="oklch(0.22 0.035 153)"
                    fontFamily={'"Pretendard Variable", Pretendard, "Noto Sans KR", "Malgun Gothic", sans-serif'}
                    fontSize={8.5}
                    fontWeight={750}
                    letterSpacing={-0.35}
                  >
                    {callout.label}
                  </text>
                </g>
              </g>
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
                    fill={todayEvent ? "#ffffff" : "#171717"}
                    stroke="#f8f7f4"
                    strokeWidth={3}
                  />
                  <text
                    x={dot.x}
                    y={dot.y + 0.6}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill={todayEvent ? "#171717" : "#ffffff"}
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

      </div>

      <div className="bg-[#fbfbfa] px-4 py-3.5 sm:px-5" aria-live="polite">
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

        <div className="mt-3 flex flex-col gap-2 rounded-2xl bg-white px-3 py-2.5 shadow-[0_8px_22px_rgba(0,0,0,.055)] sm:flex-row sm:items-center sm:justify-between">
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
          <ul
            className="mt-3 grid max-h-28 grid-cols-2 gap-2 overflow-y-auto pr-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:sr-only sm:mt-0 sm:block sm:overflow-visible sm:p-0"
            aria-label="서울 주요 지역 실시간 인구"
          >
            {populationData.points.map((point) => (
              <li
                key={point.areaCode}
                className="min-w-0 rounded-2xl bg-white px-2.5 py-2 text-[9px] leading-4 shadow-[0_6px_16px_rgba(0,0,0,.05)] sm:p-0 sm:shadow-none"
              >
                <span
                  className="font-bold"
                  style={{ color: populationVisualByCode.get(point.areaCode)?.color }}
                >
                  {point.label}
                </span>{" "}
                {compactPopulation(point)} · {point.congestionLevel}
                <span className="sr-only">, {formatPopulationTime(point.dataTime)} 기준</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-muted-foreground" aria-label="지도 범례">
          <LegendDot color="oklch(0.86 0.012 95)" label="기본 지역" />
          <LegendDot color="#8f9894" label="자치구 경계 픽셀" />
          <LegendDot color="#b7b7b2" label="코스 내 무료" />
          <LegendDot color="#2185d5" label="한강 픽셀" />
          <PopulationScaleLegend />
          <LegendDot color="#171717" label="추천 일정" />
          <LegendDot color="#ffffff" ring label="오늘 행사" />
        </div>

        <figcaption className="mt-3 flex min-w-0 flex-col items-start gap-1 pt-2.5 text-[9px] leading-4 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-2">
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

function PopulationScaleLegend() {
  return (
    <span className="inline-flex items-center gap-1.5" aria-label="실시간 인구 낮음부터 높음">
      <span>인구 낮음</span>
      <span
        className="h-2 w-14 rounded-full bg-[linear-gradient(90deg,#2563eb_0%,#06b6d4_28%,#facc15_55%,#f97316_77%,#dc2626_100%)] ring-1 ring-black/5"
        aria-hidden="true"
      />
      <span>높음</span>
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
              ? "#171717"
              : freeDistricts.has(dot.featureIndex)
                ? "#9b9b95"
                : "oklch(0.84 0.012 95)"
          }
        />
      ))}
    </svg>
  )
}
