import { seoulPlaces } from "../data/seoul-places.ts"
import {
  COMPANION_LABELS,
  INTEREST_LABELS,
  TRANSPORT_MODES,
  type Interest,
  type Place,
  type PlaceCategory,
  type PlannedStop,
  type RouteLeg,
  type TripCostBreakdown,
  type TripPlan,
  type TripRequest,
  type TransportMode,
  type Weekday,
} from "../types/trip.ts"

const SEOUL_TIME_ZONE = "Asia/Seoul"
const WALKING_METERS_PER_MINUTE = 75
const DEFAULT_ROUTE_FACTOR = 1.2
const DEFAULT_BEAM_WIDTH = 96

const WEEKDAYS: readonly Weekday[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
]

const INTEREST_CATEGORIES: Record<Exclude<Interest, "free">, readonly PlaceCategory[]> = {
  exhibition: ["museum", "exhibition"],
  "night-view": ["night-view"],
  walk: ["walk", "park", "night-view"],
  cafe: ["cafe"],
  food: ["restaurant"],
  performance: ["performance", "event"],
  park: ["park"],
  culture: ["museum", "exhibition", "event", "performance", "landmark"],
  photo: ["night-view", "walk", "park", "landmark", "exhibition"],
  rest: ["rest", "cafe", "park"],
}

export interface PlannerOptions {
  beamWidth?: number
  maxStops?: number
  walkingRouteFactor?: number
}

export interface ExactWalkingLeg {
  distanceMeters: number
  durationMinutes: number
}

interface Candidate {
  place: Place
  costWon: number
}

interface VisitSlot {
  arriveMinute: number
  startMinute: number
  departMinute: number
  waitMinutes: number
}

interface SearchState {
  lastPlace: Place | null
  currentMinute: number
  spentWon: number
  walkedMeters: number
  walkedMinutes: number
  score: number
  visitedIds: ReadonlySet<string>
  visitedCategories: ReadonlySet<PlaceCategory>
  stops: readonly PlannedStop[]
  legs: readonly RouteLeg[]
}

interface TravelEstimate {
  leg: Pick<RouteLeg, "distanceMeters" | "durationMinutes" | "mode">
  walkingMeters: number
  walkingMinutes: number
}

interface NormalizedRequest {
  request: TripRequest
  dateKey: string
  weekday: Weekday
  startMinute: number
  endMinute: number
  budgetWon: number
  maxWalkingMeters: number
  partySize: number
  variant: number
}

export function haversineMeters(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
): number {
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180
  const earthRadiusMeters = 6_371_000
  const latitudeDelta = toRadians(to.lat - from.lat)
  const longitudeDelta = toRadians(to.lng - from.lng)
  const fromLatitude = toRadians(from.lat)
  const toLatitude = toRadians(to.lat)

  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) *
      Math.cos(toLatitude) *
      Math.sin(longitudeDelta / 2) ** 2

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a))
}

export function estimateWalkingLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  routeFactor = DEFAULT_ROUTE_FACTOR,
): Pick<RouteLeg, "distanceMeters" | "durationMinutes" | "mode"> {
  const distanceMeters = Math.round(haversineMeters(from, to) * routeFactor)
  const crossingBufferMinutes = distanceMeters >= 120 ? 2 : 0
  const durationMinutes =
    distanceMeters === 0
      ? 0
      : Math.ceil(distanceMeters / WALKING_METERS_PER_MINUTE) + crossingBufferMinutes

  return { distanceMeters, durationMinutes, mode: "walk" }
}

export function estimateTravelLeg(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  mode: TransportMode,
  walkingRouteFactor = DEFAULT_ROUTE_FACTOR,
): TravelEstimate {
  if (mode === "walk") {
    const leg = estimateWalkingLeg(from, to, walkingRouteFactor)
    return {
      leg,
      walkingMeters: leg.distanceMeters,
      walkingMinutes: leg.durationMinutes,
    }
  }

  const directMeters = haversineMeters(from, to)
  if (directMeters === 0) {
    return {
      leg: { distanceMeters: 0, durationMinutes: 0, mode },
      walkingMeters: 0,
      walkingMinutes: 0,
    }
  }

  if (mode === "transit") {
    const distanceMeters = Math.round(directMeters * 1.3)
    const walkingMeters = Math.min(700, Math.round(180 + directMeters * 0.05))
    const walkingMinutes = Math.ceil(walkingMeters / WALKING_METERS_PER_MINUTE)
    const transferBufferMinutes = directMeters >= 6_000 ? 9 : 6
    const durationMinutes =
      walkingMinutes + Math.ceil(distanceMeters / 420) + transferBufferMinutes
    return {
      leg: { distanceMeters, durationMinutes, mode },
      walkingMeters,
      walkingMinutes,
    }
  }

  const distanceMeters = Math.round(directMeters * 1.35)
  const walkingMeters = Math.min(250, Math.round(80 + directMeters * 0.01))
  const walkingMinutes = Math.ceil(walkingMeters / WALKING_METERS_PER_MINUTE)
  const durationMinutes = walkingMinutes + Math.ceil(distanceMeters / 500) + 6
  return {
    leg: { distanceMeters, durationMinutes, mode },
    walkingMeters,
    walkingMinutes,
  }
}

export function placeMatchesInterest(place: Place, interest: Interest): boolean {
  if (interest === "free") return place.price.kind === "free"
  if (place.tags.includes(interest)) return true
  return INTEREST_CATEGORIES[interest].includes(place.category)
}

export function planTrip(
  request: TripRequest,
  places: readonly Place[] = seoulPlaces,
  options: PlannerOptions = {},
): TripPlan {
  const normalized = normalizeRequest(request)
  const beamWidth = Math.max(1, Math.floor(options.beamWidth ?? DEFAULT_BEAM_WIDTH))
  const routeFactor = options.walkingRouteFactor ?? DEFAULT_ROUTE_FACTOR

  if (!Number.isFinite(routeFactor) || routeFactor < 1) {
    throw new RangeError("walkingRouteFactor는 1 이상이어야 합니다.")
  }

  const availableMinutes = normalized.endMinute - normalized.startMinute
  const inferredMaxStops =
    availableMinutes <= 210
      ? 2
      : availableMinutes <= 270
        ? 3
        : availableMinutes <= 420
          ? 4
          : availableMinutes <= 540
            ? 5
            : 6
  const maxStops = Math.max(1, Math.floor(options.maxStops ?? inferredMaxStops))
  const candidates = buildCandidates(normalized, places)

  const initialState: SearchState = {
    lastPlace: null,
    currentMinute: normalized.startMinute,
    spentWon: 0,
    walkedMeters: 0,
    walkedMinutes: 0,
    score: 0,
    visitedIds: new Set<string>(),
    visitedCategories: new Set<PlaceCategory>(),
    stops: [],
    legs: [],
  }

  let frontier: readonly SearchState[] = [initialState]
  const completed: SearchState[] = []

  for (let depth = 0; depth < maxStops; depth += 1) {
    const expanded: SearchState[] = []

    for (const state of frontier) {
      for (const candidate of candidates) {
        if (state.visitedIds.has(candidate.place.id)) continue

        const fromLocation = state.lastPlace?.location ?? normalized.request.origin
        const legEstimate = estimateTravelLeg(
          fromLocation,
          candidate.place.location,
          normalized.request.transportMode,
          routeFactor,
        )

        if (
          !legRespectsAvoidances(
            legEstimate.leg.distanceMeters,
            legEstimate.walkingMeters,
            normalized.request,
          )
        ) continue

        const walkedMeters = state.walkedMeters + legEstimate.walkingMeters
        const walkedMinutes = state.walkedMinutes + legEstimate.walkingMinutes
        if (walkedMeters > normalized.maxWalkingMeters + 0.001) continue

        const spentWon = state.spentWon + candidate.costWon
        if (spentWon > normalized.budgetWon) continue

        const rawArrivalMinute = state.currentMinute + legEstimate.leg.durationMinutes
        const slot = findVisitSlot(candidate.place, normalized, rawArrivalMinute)
        if (slot === null || slot.departMinute > normalized.endMinute) continue
        const requestedNightView =
          normalized.request.wants.includes("night-view") &&
          placeMatchesInterest(candidate.place, "night-view")
        const requestedFixedEvent =
          candidate.place.event?.fixedStartTime !== undefined &&
          normalized.request.wants.some(
            (interest) => interest !== "free" && placeMatchesInterest(candidate.place, interest),
          )
        const maxWaitMinutes = maximumWaitMinutes(
          candidate.place,
          normalized.request,
          requestedNightView,
          requestedFixedEvent,
        )
        if (slot.waitMinutes > maxWaitMinutes) continue

        const isNewCategory = !state.visitedCategories.has(candidate.place.category)
        const stopScore = scoreCandidate(
          candidate.place,
          normalized.request,
          legEstimate.leg.durationMinutes,
          slot.waitMinutes,
          isNewCategory,
          normalized.variant,
        )
        const reasons = buildReasons(candidate.place, normalized.request)
        const stop: PlannedStop = {
          place: candidate.place,
          arriveMinute: slot.arriveMinute,
          startMinute: slot.startMinute,
          departMinute: slot.departMinute,
          arriveTime: formatMinute(slot.arriveMinute),
          startTime: formatMinute(slot.startMinute),
          departTime: formatMinute(slot.departMinute),
          waitMinutes: slot.waitMinutes,
          costWon: candidate.costWon,
          score: roundScore(stopScore),
          reasons,
        }
        const leg: RouteLeg = {
          fromId: state.lastPlace?.id ?? "origin",
          toId: candidate.place.id,
          provider: "estimate",
          ...legEstimate.leg,
        }

        const visitedIds = new Set(state.visitedIds)
        visitedIds.add(candidate.place.id)
        const visitedCategories = new Set(state.visitedCategories)
        visitedCategories.add(candidate.place.category)

        expanded.push({
          lastPlace: candidate.place,
          currentMinute: slot.departMinute,
          spentWon,
          walkedMeters,
          walkedMinutes,
          score: state.score + stopScore,
          visitedIds,
          visitedCategories,
          stops: [...state.stops, stop],
          legs: [...state.legs, leg],
        })
      }
    }

    if (expanded.length === 0) break

    expanded.sort(compareSearchStates)
    frontier = pruneNearDuplicateStates(expanded).slice(0, beamWidth)
    completed.push(...frontier)
  }

  const rankedStates = completed.sort((left, right) =>
    compareFinalStates(left, right, normalized.request),
  )
  const uniqueStates = [
    ...new Map(
      rankedStates.map((state) => [stateSignature(state), state] as const),
    ).values(),
  ]
  const routePool = uniqueStates.slice(0, Math.min(6, uniqueStates.length))
  const selectedRouteIndex =
    routePool.length === 0 ? 0 : Math.abs(normalized.variant) % routePool.length
  const best = routePool[selectedRouteIndex] ?? initialState
  const costs = buildCostBreakdown(best.stops)
  const warnings = buildWarnings(normalized, places, best)
  const idPayload = [
    normalized.dateKey,
    request.startTime,
    request.endTime,
    request.budgetWon,
    request.maxWalkingKm,
    normalized.request.transportMode,
    request.companion,
    normalized.variant,
    ...best.stops.map((stop) =>
      [
        stop.place.id,
        stop.place.source.updatedAt,
        stop.costWon,
        stop.startMinute,
        stop.departMinute,
      ].join("@"),
    ),
  ].join("|")

  return {
    id: `zero-trip-${stableHash(idPayload).toString(36)}`,
    title: buildTitle(normalized),
    request: normalized.request,
    stops: best.stops,
    legs: best.legs,
    costs,
    totals: {
      durationMinutes:
        best.stops.length === 0 ? 0 : best.currentMinute - normalized.startMinute,
      activityMinutes: best.stops.reduce(
        (total, stop) => total + stop.departMinute - stop.startMinute,
        0,
      ),
      walkingMinutes: best.walkedMinutes,
      waitingMinutes: best.stops.reduce((total, stop) => total + stop.waitMinutes, 0),
      walkingMeters: best.walkedMeters,
      contentCostWon: costs.totalWon,
      stopCount: best.stops.length,
    },
    warnings,
  }
}

export const generateTrip = planTrip

/**
 * Rebuilds the selected itinerary with provider-supplied walking legs. The
 * exact route is accepted only when opening hours, wait limits, the requested
 * end time, per-leg limits, and the total walking cap still hold. Passing a
 * prefix of the original legs safely trims an overlong route.
 */
export function retimeTripPlanWithWalkingLegs(
  plan: TripPlan,
  exactLegs: readonly ExactWalkingLeg[],
  directionsUrl?: string,
  allPlaces: readonly Place[] = plan.stops.map((stop) => stop.place),
): TripPlan | null {
  if ((plan.request.transportMode ?? "walk") !== "walk") return null
  if (exactLegs.length > plan.stops.length) return null
  if (
    exactLegs.some(
      (leg) =>
        !Number.isFinite(leg.distanceMeters) ||
        leg.distanceMeters < 0 ||
        !Number.isFinite(leg.durationMinutes) ||
        leg.durationMinutes < 0,
    )
  ) {
    return null
  }

  const normalized = normalizeRequest(plan.request)
  const originalStops = plan.stops.slice(0, exactLegs.length)
  const stops: PlannedStop[] = []
  const legs: RouteLeg[] = []
  let currentMinute = normalized.startMinute
  let walkedMeters = 0

  for (let index = 0; index < originalStops.length; index += 1) {
    const original = originalStops[index]
    const exact = exactLegs[index]
    if (!legRespectsAvoidances(exact.distanceMeters, exact.distanceMeters, normalized.request)) {
      return null
    }
    walkedMeters += exact.distanceMeters
    if (walkedMeters > normalized.maxWalkingMeters + 0.001) return null

    const slot = findVisitSlot(
      original.place,
      normalized,
      currentMinute + Math.ceil(exact.durationMinutes),
    )
    if (!slot || slot.departMinute > normalized.endMinute) return null
    const requestedNightView =
      normalized.request.wants.includes("night-view") &&
      placeMatchesInterest(original.place, "night-view")
    const requestedFixedEvent =
      original.place.event?.fixedStartTime !== undefined &&
      normalized.request.wants.some(
        (interest) =>
          interest !== "free" && placeMatchesInterest(original.place, interest),
      )
    if (
      slot.waitMinutes >
      maximumWaitMinutes(
        original.place,
        normalized.request,
        requestedNightView,
        requestedFixedEvent,
      )
    ) {
      return null
    }

    stops.push({
      ...original,
      arriveMinute: slot.arriveMinute,
      startMinute: slot.startMinute,
      departMinute: slot.departMinute,
      arriveTime: formatMinute(slot.arriveMinute),
      startTime: formatMinute(slot.startMinute),
      departTime: formatMinute(slot.departMinute),
      waitMinutes: slot.waitMinutes,
    })
    legs.push({
      fromId: index === 0 ? "origin" : originalStops[index - 1].place.id,
      toId: original.place.id,
      mode: "walk",
      distanceMeters: Math.round(exact.distanceMeters),
      durationMinutes: Math.ceil(exact.durationMinutes),
      provider: "kakao",
    })
    currentMinute = slot.departMinute
  }

  const costs = buildCostBreakdown(stops)
  const activityMinutes = stops.reduce(
    (total, stop) => total + stop.departMinute - stop.startMinute,
    0,
  )
  const walkingMinutes = legs.reduce((total, leg) => total + leg.durationMinutes, 0)
  const waitingMinutes = stops.reduce((total, stop) => total + stop.waitMinutes, 0)
  const routeSignature = legs
    .map((leg) => `${leg.distanceMeters}:${leg.durationMinutes}`)
    .join("|")
  const warnings = buildWarnings(normalized, allPlaces, { stops })

  return {
    ...plan,
    id: `${plan.id}-k${stableHash(routeSignature).toString(36)}`,
    stops,
    legs,
    costs,
    totals: {
      durationMinutes: currentMinute - normalized.startMinute,
      activityMinutes,
      walkingMinutes,
      waitingMinutes,
      walkingMeters: Math.round(walkedMeters),
      contentCostWon: costs.totalWon,
      stopCount: stops.length,
    },
    warnings,
    directionsUrl,
  }
}

function normalizeRequest(request: TripRequest): NormalizedRequest {
  if (!Number.isFinite(request.origin.lat) || !Number.isFinite(request.origin.lng)) {
    throw new TypeError("출발 위치 좌표가 올바르지 않습니다.")
  }

  const startMinute = parseTime(request.startTime)
  const endMinute = parseTime(request.endTime)
  if (startMinute >= endMinute) {
    throw new RangeError("종료 시간은 시작 시간보다 늦어야 합니다.")
  }

  if (!Number.isFinite(request.budgetWon) || request.budgetWon < 0) {
    throw new RangeError("예산은 0 이상의 숫자여야 합니다.")
  }

  if (!Number.isFinite(request.maxWalkingKm) || request.maxWalkingKm < 0) {
    throw new RangeError("최대 도보거리는 0 이상의 숫자여야 합니다.")
  }

  const transportMode = request.transportMode ?? "walk"
  if (!TRANSPORT_MODES.includes(transportMode)) {
    throw new RangeError("지원하지 않는 이동수단입니다.")
  }

  const partySize = request.partySize ?? 1
  if (!Number.isInteger(partySize) || partySize < 1) {
    throw new RangeError("인원수는 1 이상의 정수여야 합니다.")
  }

  const dateKey = toSeoulDateKey(request.date)
  const weekdayIndex = weekdayIndexForDateKey(dateKey)

  return {
    request: { ...request, transportMode },
    dateKey,
    weekday: WEEKDAYS[weekdayIndex],
    startMinute,
    endMinute,
    budgetWon: Math.floor(request.budgetWon),
    maxWalkingMeters: request.maxWalkingKm * 1_000,
    partySize,
    variant: Math.trunc(request.variant ?? 0),
  }
}

function buildCandidates(
  normalized: NormalizedRequest,
  places: readonly Place[],
): readonly Candidate[] {
  return places
    .filter((place) => hasValidCoordinates(place))
    .filter((place) => place.companions.includes(normalized.request.companion))
    .filter((place) => placeRespectsAvoidances(place, normalized.request))
    .filter((place) => isEventAvailable(place, normalized.dateKey))
    .filter((place) => place.openingHours[normalized.weekday].length > 0)
    .flatMap((place): Candidate[] => {
      const price = priceForParty(place, normalized.request.companion, normalized.partySize)
      return price === null ? [] : [{ place, costWon: price }]
    })
    .filter((candidate) => candidate.costWon <= normalized.budgetWon)
    .sort((left, right) => left.place.id.localeCompare(right.place.id))
}

function hasValidCoordinates(place: Place): boolean {
  return (
    Number.isFinite(place.location.lat) &&
    Number.isFinite(place.location.lng) &&
    place.location.lat >= -90 &&
    place.location.lat <= 90 &&
    place.location.lng >= -180 &&
    place.location.lng <= 180
  )
}

function placeRespectsAvoidances(place: Place, request: TripRequest): boolean {
  if (request.avoids.some((avoidance) => place.avoidFlags.includes(avoidance))) {
    return false
  }

  if (request.avoids.includes("crowds") && place.crowdLevel === "high") {
    return false
  }

  if (request.avoids.includes("waiting") && place.event?.requiresReservation) {
    return false
  }

  if (request.companion === "pet" && place.amenities.petFriendly !== true) {
    return false
  }

  return true
}

function legRespectsAvoidances(
  distanceMeters: number,
  walkingMeters: number,
  request: TripRequest,
): boolean {
  const maximumLegMeters =
    request.transportMode === "walk" ? 2_800 : request.transportMode === "transit" ? 25_000 : 35_000
  const longDistanceMeters =
    request.transportMode === "walk" ? 1_500 : request.transportMode === "transit" ? 12_000 : 16_000
  if (distanceMeters > maximumLegMeters) return false
  if (request.avoids.includes("long-walk") && walkingMeters > 850) return false
  if (request.avoids.includes("long-distance") && distanceMeters > longDistanceMeters) return false
  return true
}

function maximumWaitMinutes(
  place: Place,
  request: TripRequest,
  requestedNightView =
    request.wants.includes("night-view") && placeMatchesInterest(place, "night-view"),
  requestedFixedEvent =
    place.event?.fixedStartTime !== undefined &&
    request.wants.some(
      (interest) => interest !== "free" && placeMatchesInterest(place, interest),
    ),
) {
  if (request.avoids.includes("waiting")) return 15
  if (requestedFixedEvent) return 360
  return requestedNightView ? 120 : 60
}

function priceForParty(
  place: Place,
  companion: TripRequest["companion"],
  partySize: number,
): number | null {
  if (place.price.kind === "unknown") return null
  if (place.price.kind === "free") return 0

  if (place.price.basis === "per-person") {
    const conservativePrice = place.price.maximumWon
    return conservativePrice === null ? null : conservativePrice * partySize
  }

  const adultPrice = place.price.adultWon
  if (adultPrice === null) return null

  if (companion === "children" && partySize > 1) {
    const childPrice = place.price.childWon
    return childPrice === null ? null : adultPrice + childPrice * (partySize - 1)
  }

  return adultPrice * partySize
}

function isEventAvailable(place: Place, dateKey: string): boolean {
  if (place.event === undefined) return true
  return dateKey >= place.event.startDate && dateKey <= place.event.endDate
}

function findVisitSlot(
  place: Place,
  normalized: NormalizedRequest,
  rawArrivalMinute: number,
): VisitSlot | null {
  const windows = [...place.openingHours[normalized.weekday]].sort(
    (left, right) => parseTime(left.open) - parseTime(right.open),
  )

  for (const window of windows) {
    const nightViewStartMinute =
      placeMatchesInterest(place, "night-view") &&
      normalized.request.wants.includes("night-view")
        ? 17 * 60 + 30
        : 0
    const openMinute = Math.max(parseTime(window.open), nightViewStartMinute)
    const closeMinute = parseTime(window.close)
    const latestAdmissionMinute =
      closeMinute - (window.lastAdmissionMinutesBeforeClose ?? 0)

    let startMinute: number
    if (place.event?.fixedStartTime !== undefined) {
      startMinute = parseTime(place.event.fixedStartTime)
      if (rawArrivalMinute > startMinute) continue
    } else {
      startMinute = Math.max(rawArrivalMinute, openMinute)
    }

    const departMinute = startMinute + place.recommendedVisitMinutes
    if (startMinute < openMinute) continue
    if (startMinute > latestAdmissionMinute) continue
    if (departMinute > closeMinute) continue

    return {
      arriveMinute: rawArrivalMinute,
      startMinute,
      departMinute,
      waitMinutes: Math.max(0, startMinute - rawArrivalMinute),
    }
  }

  return null
}

function scoreCandidate(
  place: Place,
  request: TripRequest,
  travelMinutes: number,
  waitMinutes: number,
  isNewCategory: boolean,
  variant: number,
): number {
  const matchingInterests = request.wants.filter((interest) =>
    placeMatchesInterest(place, interest),
  )

  let score = 25
  score += matchingInterests.length * 24
  score += place.price.kind === "free" ? (request.wants.includes("free") ? 16 : 5) : 0
  score += isNewCategory ? 18 : -18
  score += place.tags.includes("tour") ? 14 : 0
  score += place.amenities.wifi.available ? 4 : 0
  score += place.crowdLevel === "low" ? 5 : place.crowdLevel === "high" ? -5 : 0
  score += place.event !== undefined ? 4 : 0
  score += companionFitScore(place, request.companion)
  score -= travelMinutes / 3.5
  score -= waitMinutes / 8

  // A small deterministic perturbation lets “다시 짜기” return a different
  // equally-good route without allowing randomness to violate constraints.
  score += (stableHash(`${variant}:${place.id}`) % 101) / 100

  return score
}

function companionFitScore(place: Place, companion: TripRequest["companion"]): number {
  if (companion === "couple") {
    let score = 0
    if (place.tags.includes("photo")) score += 8
    if (place.tags.includes("art") || place.tags.includes("garden")) score += 6
    if (placeMatchesInterest(place, "night-view") || place.category === "cafe") score += 10
    return score
  }

  if (companion === "solo") {
    let score = 0
    if (place.tags.includes("quiet") || place.tags.includes("library")) score += 10
    if (place.category === "museum" || place.category === "exhibition") score += 6
    return score
  }

  if (companion === "children") {
    let score = 0
    if (place.tags.includes("family")) score += 28
    if (place.amenities.accessible === true) score += 7
    if (place.category === "park") score += 18
    if (place.category === "museum") score += 10
    return score
  }

  if (companion === "parents") {
    let score = 0
    if (place.amenities.accessible === true) score += 12
    if (place.tags.includes("quiet") || place.tags.includes("indoor")) score += 7
    if (place.category === "rest") score += 8
    if (place.avoidFlags.includes("stairs") || place.avoidFlags.includes("long-walk")) score -= 16
    return score
  }

  let score = 0
  if (place.amenities.petFriendly === true) score += 12
  if (place.category === "park" || place.category === "walk") score += 8
  return score
}

function buildReasons(place: Place, request: TripRequest): readonly string[] {
  const reasons: string[] = []
  const matches = request.wants.filter((interest) => placeMatchesInterest(place, interest))

  if (place.price.kind === "free") reasons.push("콘텐츠 비용 0원")
  if (place.tags.includes("tour")) reasons.push("걸어서 즐기는 자유 투어")
  for (const interest of matches.slice(0, 2)) {
    if (interest !== "free") reasons.push(`${INTEREST_LABELS[interest]} 취향과 잘 맞아요`)
  }
  if (place.amenities.wifi.available) reasons.push("무료 Wi-Fi 이용 가능")
  if (reasons.length === 0) {
    reasons.push(`${COMPANION_LABELS[request.companion]} 일정에 잘 맞아요`)
  }

  return reasons.slice(0, 3)
}

function compareSearchStates(left: SearchState, right: SearchState): number {
  const scoreDifference = searchRank(right) - searchRank(left)
  if (Math.abs(scoreDifference) > 0.000_001) return scoreDifference
  return stateSignature(left).localeCompare(stateSignature(right))
}

function compareFinalStates(
  left: SearchState,
  right: SearchState,
  request: TripRequest,
): number {
  const coverageDifference =
    preferenceCoverage(right, request) - preferenceCoverage(left, request)
  if (coverageDifference !== 0) return coverageDifference

  const scoreDifference =
    right.score +
    right.stops.length * 12 +
    right.visitedCategories.size * 10 -
    (left.score + left.stops.length * 12 + left.visitedCategories.size * 10)
  if (Math.abs(scoreDifference) > 0.000_001) return scoreDifference
  if (right.stops.length !== left.stops.length) return right.stops.length - left.stops.length
  if (left.spentWon !== right.spentWon) return left.spentWon - right.spentWon
  if (left.walkedMeters !== right.walkedMeters) return left.walkedMeters - right.walkedMeters
  return stateSignature(left).localeCompare(stateSignature(right))
}

function preferenceCoverage(state: SearchState, request: TripRequest): number {
  return request.wants.filter((interest) =>
    state.stops.some((stop) => placeMatchesInterest(stop.place, interest)),
  ).length
}

function searchRank(state: SearchState): number {
  return (
    state.score +
    state.stops.length * 12 +
    state.visitedCategories.size * 6 -
    state.walkedMeters / 2_000
  )
}

function stateSignature(state: SearchState): string {
  return state.stops.map((stop) => stop.place.id).join(">")
}

function pruneNearDuplicateStates(states: readonly SearchState[]): SearchState[] {
  const bestByBucket = new Map<string, SearchState>()

  for (const state of states) {
    const bucket = [
      state.lastPlace?.id ?? "origin",
      Math.floor(state.currentMinute / 15),
      Math.floor(state.spentWon / 1_000),
      Math.floor(state.walkedMeters / 300),
      state.stops.length,
    ].join("|")
    const existing = bestByBucket.get(bucket)
    if (existing === undefined || compareSearchStates(state, existing) < 0) {
      bestByBucket.set(bucket, state)
    }
  }

  return [...bestByBucket.values()].sort(compareSearchStates)
}

function buildCostBreakdown(stops: readonly PlannedStop[]): TripCostBreakdown {
  const costs: TripCostBreakdown = {
    admissionWon: 0,
    exhibitionWon: 0,
    performanceWon: 0,
    cafeWon: 0,
    mealWon: 0,
    wifiWon: 0,
    totalWon: 0,
  }

  for (const stop of stops) {
    if (stop.place.category === "exhibition") {
      costs.exhibitionWon += stop.costWon
    } else if (stop.place.category === "cafe") {
      costs.cafeWon += stop.costWon
    } else if (stop.place.category === "restaurant") {
      costs.mealWon += stop.costWon
    } else if (
      stop.place.category === "performance" ||
      stop.place.category === "event"
    ) {
      costs.performanceWon += stop.costWon
    } else {
      costs.admissionWon += stop.costWon
    }
    costs.totalWon += stop.costWon
  }

  return costs
}

function buildWarnings(
  normalized: NormalizedRequest,
  allPlaces: readonly Place[],
  state: Pick<SearchState, "stops">,
): readonly string[] {
  const travelEstimateWarning =
    normalized.request.transportMode === "walk"
      ? "도보 거리와 시간은 직선거리를 보정한 추정치예요."
      : normalized.request.transportMode === "transit"
        ? "대중교통 이동시간은 거리와 환승·대기시간을 반영한 추정치이며 실시간 운행정보가 아니에요."
        : "차량 이동시간은 서울 도심 평균속도와 주차 여유시간을 반영한 추정치이며 실시간 교통정보가 아니에요."
  const warnings: string[] = [
    `예상 비용은 ${normalized.partySize}인 기준이며 선택한 카페·식당의 검증된 가격대 상한을 포함하지만 교통비는 포함하지 않아요.`,
    travelEstimateWarning,
  ]

  if (state.stops.length === 0) {
    warnings.unshift(
      "현재 조건을 모두 만족하는 코스를 찾지 못했어요. 이용 시간이나 이동 조건을 조정해 보세요.",
    )
  }

  const unmatched = normalized.request.wants.filter(
    (interest) =>
      interest !== "free" &&
      !state.stops.some((stop) => placeMatchesInterest(stop.place, interest)),
  )
  if (state.stops.length > 0 && unmatched.length > 0) {
    warnings.push(
      `조건 안에서 ${unmatched.map((interest) => INTEREST_LABELS[interest]).join(", ")} 장소는 포함하지 못했어요.`,
    )
  }

  if (
    normalized.request.wants.includes("night-view") &&
    state.stops.some(
      (stop) => placeMatchesInterest(stop.place, "night-view") && stop.startMinute < 18 * 60,
    )
  ) {
    warnings.push("전망·야경 장소는 일몰 전 도착할 수 있어요. 계절별 일몰 시각을 확인해 주세요.")
  }

  const longestWait = Math.max(0, ...state.stops.map((stop) => stop.waitMinutes))
  if (longestWait >= 90) {
    warnings.push(
      `고정 일정에 맞추기 위한 자유시간이 최대 ${longestWait}분 있어요. 주변에서 쉬었다가 출발하세요.`,
    )
  }

  if (allPlaces.some((place) => place.price.kind === "unknown")) {
    warnings.push("가격이 확인되지 않은 장소는 예산을 지키기 위해 추천에서 제외했어요.")
  }

  if (state.stops.some((stop) => stop.place.source.name.includes("데모"))) {
    warnings.push("현재는 데모 데이터예요. 출발 전 실제 운영시간과 예약 여부를 확인해 주세요.")
  }

  for (const stop of state.stops) {
    if (stop.place.availabilityNote !== undefined) {
      warnings.push(`${stop.place.name}: ${stop.place.availabilityNote}`)
    }
  }

  return [...new Set(warnings)]
}

function buildTitle(normalized: NormalizedRequest): string {
  const [year, month, day] = normalized.dateKey.split("-").map(Number)
  const dayLabel = `${year}년 ${month}월 ${day}일`

  if (normalized.budgetWon === 0 && normalized.request.companion === "couple") {
    return `${dayLabel} 0원 데이트`
  }
  if (normalized.budgetWon === 0) return `${dayLabel} 0원 여행`
  return `${dayLabel} 1인 ${normalized.budgetWon.toLocaleString("ko-KR")}원 예산 여행`
}

function toSeoulDateKey(input: string | Date): string {
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) throw new RangeError("날짜가 올바르지 않습니다.")
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: SEOUL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    const parts = formatter.formatToParts(input)
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((item) => item.type === type)?.value
    return `${part("year")}-${part("month")}-${part("day")}`
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input)
  if (match === null) throw new RangeError("날짜는 YYYY-MM-DD 형식이어야 합니다.")
  const dateKey = `${match[1]}-${match[2]}-${match[3]}`
  const [year, month, day] = dateKey.split("-").map(Number)
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    throw new RangeError("날짜가 올바르지 않습니다.")
  }
  return dateKey
}

function weekdayIndexForDateKey(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number)
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay()
}

function parseTime(value: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (match === null) throw new RangeError(`시간 형식이 올바르지 않습니다: ${value}`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours === 24 && minutes === 0) return 1_440
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new RangeError(`시간 형식이 올바르지 않습니다: ${value}`)
  }
  return hours * 60 + minutes
}

function formatMinute(value: number): string {
  if (value === 1_440) return "24:00"
  const hours = Math.floor(value / 60)
  const minutes = value % 60
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
}

function stableHash(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function roundScore(value: number): number {
  return Math.round(value * 10) / 10
}
