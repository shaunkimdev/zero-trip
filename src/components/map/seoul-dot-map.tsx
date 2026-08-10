import { ExternalLink } from "lucide-react"

import {
  SEOUL_BOUNDARY_SOURCE,
  seoulGuBoundaries,
  type SeoulGuProperties,
} from "@/data/seoul-boundaries"
import { seoulPlaces } from "@/data/seoul-places"
import {
  createGeoProjection,
  findContainingFeature,
  getFeatureCollectionBounds,
  sampleFeatureCollection,
  type GeoPosition,
} from "@/lib/geo"
import { cn } from "@/lib/utils"
import type { GeoPoint, Place, PlannedStop, TripPlan } from "@/types/trip"

const MAP_WIDTH = 720
const MAP_HEIGHT = 470
const DOT_SPACING = 11
const DOT_RADIUS = 3.1

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
  if (place.price.kind !== "free" && place.price.adultWon !== 0) continue
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
  const markers = stopDots(plan.stops)
  const routeDistricts = new Set(
    plan.stops
      .map((stop) => districtForPoint(stop.place.location).index)
      .filter((index) => index >= 0),
  )
  const activeMarker =
    markers.find(({ stop }) => stop.place.id === activeStopId) ?? markers[0]
  const activeDistrict = activeMarker
    ? seoulGuBoundaries.features[activeMarker.dot.featureIndex]?.properties
    : undefined
  const activeFreeCount = activeMarker
    ? freeContentByDistrict.get(activeMarker.dot.featureIndex) ?? 0
    : 0
  const todayEventCount = activeMarker
    ? placeCatalog.filter((place) => {
        if (placeDistrictIndex.get(place.id) !== activeMarker.dot.featureIndex) return false
        if (!place.event) return false
        const target = isoDate(plan.request.date)
        return target >= place.event.startDate && target <= place.event.endDate
      }).length
    : 0

  return (
    <figure
      className={cn(
        "w-full min-w-0 max-w-full overflow-hidden rounded-xl border border-border bg-[#f8f7f4]",
        className,
      )}
      aria-labelledby="seoul-dot-map-title"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border/80 px-5 py-4">
        <div>
          <p className="text-[10px] font-semibold tracking-[0.16em] text-muted-foreground">
            DOT ATLAS · SEOUL
          </p>
          <h3
            id="seoul-dot-map-title"
            className="mt-1 text-lg font-semibold tracking-[-0.035em]"
          >
            서울특별시
          </h3>
        </div>
        <p className="text-right text-[11px] leading-5 text-muted-foreground">
          코스가 닿는 지역
          <br />
          <strong className="text-base font-semibold text-foreground">
            {routeDistricts.size}
          </strong>{" "}
          / 25개 구
        </p>
      </div>

      <div className="relative aspect-[72/47] w-full" data-testid="seoul-dot-map">
        <svg
          viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
          preserveAspectRatio="xMidYMid meet"
          className="absolute inset-0 size-full"
          role="img"
          aria-labelledby="seoul-dot-map-svg-title seoul-dot-map-svg-desc"
        >
          <title id="seoul-dot-map-svg-title">서울 25개 자치구 점 지도</title>
          <desc id="seoul-dot-map-svg-desc">
            실제 행정경계 안쪽을 같은 간격의 원으로 채우고, 일정의 방문 위치를 번호가 있는 원으로 표시한 지도입니다.
          </desc>

          <g aria-hidden="true">
            {seoulDots.map((dot) => {
              const onRoute = routeDistricts.has(dot.featureIndex)
              const hasFreeContent = freeDistricts.has(dot.featureIndex)
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
              className="absolute z-10 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full bg-transparent outline-none transition-transform duration-200 hover:scale-[1.08] focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#f8f7f4]"
              style={{
                left: `${(dot.x / MAP_WIDTH) * 100}%`,
                top: `${(dot.y / MAP_HEIGHT) * 100}%`,
              }}
            />
          )
        })}
      </div>

      <div className="border-t border-border/80 px-5 py-4" aria-live="polite">
        <div className="flex items-start justify-between gap-5">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.14em] text-muted-foreground">
              {districtName(activeDistrict)} · {activeMarker ? `${activeMarker.index + 1}번째 일정` : "일정"}
            </p>
            <p className="mt-1 truncate text-sm font-semibold">
              {activeMarker?.stop.place.name ?? "점을 눌러 일정을 살펴보세요"}
            </p>
          </div>
          <div className="shrink-0 text-right text-[10px] leading-5 text-muted-foreground">
            <p>무료 장소 {activeFreeCount}곳</p>
            <p>오늘 행사 {todayEventCount}개</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[10px] text-muted-foreground" aria-label="지도 범례">
          <LegendDot color="oklch(0.86 0.012 95)" label="기본 지역" />
          <LegendDot color="oklch(0.76 0.035 145)" label="무료 콘텐츠" />
          <LegendDot color="oklch(0.30 0.075 155)" label="추천 일정" />
          <LegendDot color="oklch(0.91 0.14 125)" ring label="오늘 행사" />
        </div>

        <figcaption className="mt-4 flex min-w-0 flex-col items-start gap-1 border-t border-border/70 pt-3 text-[9px] leading-4 text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <span>균일 격자 · point-in-polygon · SVG circles</span>
          <a
            href={SEOUL_BOUNDARY_SOURCE.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-w-0 items-center gap-1 underline decoration-border underline-offset-2 hover:text-foreground"
            title={`${SEOUL_BOUNDARY_SOURCE.label} · ${SEOUL_BOUNDARY_SOURCE.license}`}
          >
            경계 데이터 출처 · {SEOUL_BOUNDARY_SOURCE.license}
            <ExternalLink className="size-2.5" />
          </a>
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
