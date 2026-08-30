import {
  PLACE_CATEGORIES,
  TRANSPORT_MODES,
  type TripPlan,
  type TripRequest,
} from "@/types/trip"

interface TripPlanPayload {
  plan?: TripPlan
  error?: { message?: string }
}

const apiOptional = import.meta.env.VITE_ZERO_TRIP_API_MODE === "optional"
const REQUEST_TIMEOUT_MS = 65_000

function planEndpoint() {
  const configuredBase = import.meta.env.VITE_ZERO_TRIP_API_BASE_URL?.trim() || "/"
  const base = configuredBase.endsWith("/") ? configuredBase : `${configuredBase}/`
  return new URL("api/trips/plan", new URL(base, window.location.origin)).toString()
}

const categories = new Set<string>(PLACE_CATEGORIES)
const transportModes = new Set<string>(TRANSPORT_MODES)

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function finite(value: unknown) {
  return typeof value === "number" && Number.isFinite(value)
}

function kakaoDirectionsUrl(value: unknown) {
  if (typeof value !== "string") return false
  try {
    const url = new URL(value, "https://zero-trip.local")
    const hostname = url.hostname.toLowerCase()
    return (
      url.protocol === "https:" &&
      (hostname === "kakao.com" || hostname.endsWith(".kakao.com"))
    )
  } catch {
    return false
  }
}

function publicWebUrl(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return false
  try {
    const url = new URL(value, "https://zero-trip.local")
    return url.protocol === "https:" || url.protocol === "http:"
  } catch {
    return false
  }
}

function nonnegativeInteger(value: unknown) {
  return typeof value === "number" && value >= 0 && Number.isInteger(value)
}

function finiteOrNull(value: unknown) {
  return value === null || finite(value)
}

function strings(value: unknown) {
  return Array.isArray(value) && value.every((item) => typeof item === "string")
}

function validExternalReferences(value: unknown) {
  const references = record(value)
  if (!references) return false
  const tourApi = references.tourApi === undefined ? null : record(references.tourApi)
  const kakao = references.kakao === undefined ? null : record(references.kakao)
  if (
    references.tourApi !== undefined &&
    (!tourApi ||
      typeof tourApi.contentId !== "string" ||
      typeof tourApi.matchedAt !== "string" ||
      (tourApi.modifiedAt !== undefined && typeof tourApi.modifiedAt !== "string"))
  ) {
    return false
  }
  if (
    references.kakao !== undefined &&
    (!kakao ||
      typeof kakao.placeId !== "string" ||
      typeof kakao.matchedAt !== "string" ||
      (kakao.placeUrl !== undefined && !kakaoDirectionsUrl(kakao.placeUrl)))
  ) {
    return false
  }
  return true
}

function validPlaceImage(value: unknown) {
  const image = record(value)
  return Boolean(
    image &&
      publicWebUrl(image.url) &&
      (image.thumbnailUrl === undefined || publicWebUrl(image.thumbnailUrl)) &&
      typeof image.alt === "string" &&
      typeof image.sourceName === "string",
  )
}

function validPlace(value: unknown) {
  const place = record(value)
  const location = record(place?.location)
  const price = record(place?.price)
  const amenities = record(place?.amenities)
  const wifi = record(amenities?.wifi)
  const source = record(place?.source)
  return Boolean(
    place &&
      typeof place.id === "string" &&
      typeof place.name === "string" &&
      typeof place.category === "string" &&
      categories.has(place.category) &&
      location &&
      finite(location.lat) &&
      finite(location.lng) &&
      price &&
      (price.kind === "free" || price.kind === "paid" || price.kind === "unknown") &&
      (price.basis === "admission" || price.basis === "per-person") &&
      finiteOrNull(price.adultWon) &&
      finiteOrNull(price.youthWon) &&
      finiteOrNull(price.childWon) &&
      finiteOrNull(price.minimumWon) &&
      finiteOrNull(price.maximumWon) &&
      amenities &&
      wifi &&
      typeof wifi.available === "boolean" &&
      strings(place.tags) &&
      source &&
      typeof source.name === "string" &&
      typeof source.updatedAt === "string" &&
      (place.images === undefined ||
        (Array.isArray(place.images) &&
          place.images.length <= 10 &&
          place.images.every(validPlaceImage))) &&
      (place.externalReferences === undefined ||
        validExternalReferences(place.externalReferences)),
  )
}

function validStop(value: unknown) {
  const stop = record(value)
  return Boolean(
    stop &&
      validPlace(stop.place) &&
      finite(stop.arriveMinute) &&
      finite(stop.startMinute) &&
      finite(stop.departMinute) &&
      typeof stop.arriveTime === "string" &&
      typeof stop.startTime === "string" &&
      typeof stop.departTime === "string" &&
      finite(stop.costWon) &&
      strings(stop.reasons),
  )
}

function validLeg(value: unknown) {
  const leg = record(value)
  return Boolean(
    leg &&
      typeof leg.fromId === "string" &&
      typeof leg.toId === "string" &&
      typeof leg.mode === "string" &&
      transportModes.has(leg.mode) &&
      finite(leg.distanceMeters) &&
      finite(leg.durationMinutes) &&
      (leg.provider === undefined ||
        leg.provider === "estimate" ||
        leg.provider === "kakao"),
  )
}

const integrationStates = new Set(["applied", "skipped", "unavailable"])

function validIntegrations(value: unknown) {
  const integrations = record(value)
  if (!integrations) return false
  const kma = integrations.kma === undefined ? null : record(integrations.kma)
  const kakao = integrations.kakao === undefined ? null : record(integrations.kakao)
  const tourApi = integrations.tourApi === undefined ? null : record(integrations.tourApi)
  if (
    integrations.kma !== undefined &&
    (!kma ||
      !integrationStates.has(String(kma.state)) ||
      !nonnegativeInteger(kma.forecastPointCount) ||
      !nonnegativeInteger(kma.outdoorPlacesExcluded) ||
      (kma.issuedAt !== undefined && typeof kma.issuedAt !== "string"))
  ) {
    return false
  }
  if (
    integrations.kakao !== undefined &&
    (!kakao ||
      !integrationStates.has(String(kakao.state)) ||
      !nonnegativeInteger(kakao.matchedPlaceCount) ||
      typeof kakao.routeApplied !== "boolean")
  ) {
    return false
  }
  if (
    integrations.tourApi !== undefined &&
    (!tourApi ||
      !integrationStates.has(String(tourApi.state)) ||
      !nonnegativeInteger(tourApi.resultCount) ||
      !nonnegativeInteger(tourApi.matchedPlaceCount))
  ) {
    return false
  }
  return true
}

function hasFiniteFields(value: unknown, fields: readonly string[]) {
  const row = record(value)
  return Boolean(row && fields.every((field) => finite(row[field])))
}

export function isTripPlan(value: unknown): value is TripPlan {
  const plan = record(value)
  const request = record(plan?.request)
  const origin = record(request?.origin)
  if (!plan || !request || !origin) return false
  if (
    typeof plan.id !== "string" ||
    typeof plan.title !== "string" ||
    typeof request.date !== "string" ||
    typeof request.startTime !== "string" ||
    typeof request.endTime !== "string" ||
    (request.transportMode !== undefined &&
      (typeof request.transportMode !== "string" ||
        !transportModes.has(request.transportMode))) ||
    !finite(request.budgetWon) ||
    !finite(request.maxWalkingKm) ||
    !finite(origin.lat) ||
    !finite(origin.lng) ||
    !Array.isArray(plan.stops) ||
    !plan.stops.every(validStop) ||
    !Array.isArray(plan.legs) ||
    !plan.legs.every(validLeg) ||
    !strings(plan.warnings)
  ) {
    return false
  }
  if (
    !hasFiniteFields(plan.costs, [
      "admissionWon",
      "exhibitionWon",
      "performanceWon",
      "cafeWon",
      "mealWon",
      "wifiWon",
      "totalWon",
    ]) ||
    !hasFiniteFields(plan.totals, [
      "durationMinutes",
      "activityMinutes",
      "walkingMinutes",
      "waitingMinutes",
      "walkingMeters",
      "contentCostWon",
      "stopCount",
    ])
  ) {
    return false
  }
  if (plan.grounding !== undefined) {
    const grounding = record(plan.grounding)
    if (
      !grounding ||
      (grounding.mode !== "ragflow" && grounding.mode !== "demo") ||
      typeof grounding.provider !== "string" ||
      typeof grounding.retrievedAt !== "string" ||
      !finite(grounding.retrievedChunkCount) ||
      !finite(grounding.acceptedPlaceCount) ||
      !finite(grounding.rejectedChunkCount)
    ) {
      return false
    }
  }
  if (plan.directionsUrl !== undefined && !kakaoDirectionsUrl(plan.directionsUrl)) {
    return false
  }
  if (plan.integrations !== undefined && !validIntegrations(plan.integrations)) {
    return false
  }
  const integrations = record(plan.integrations)
  const kakao = record(integrations?.kakao)
  if (
    kakao?.routeApplied === true &&
    (request.transportMode !== "walk" ||
      plan.legs.length !== plan.stops.length ||
      !plan.legs.every((leg) => record(leg)?.provider === "kakao"))
  ) {
    return false
  }
  return true
}

/**
 * Requests the server-side, RAG-grounded planner. `null` means this deployment
 * has no API backend (for example a static GitHub Pages preview), so callers may
 * use the visibly labelled demo catalog instead.
 */
export async function requestTripPlan(
  request: TripRequest,
  signal?: AbortSignal,
): Promise<TripPlan | null> {
  const controller = new AbortController()
  const forwardAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener("abort", forwardAbort, { once: true })
  if (signal?.aborted) forwardAbort()
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  try {
    const response = await fetch(planEndpoint(), {
      method: "POST",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ request }),
    })
    const contentType = response.headers.get("content-type") ?? ""
    if (response.status === 404) {
      if (apiOptional) return null
      throw new Error("추천 API가 배포되지 않았어요.")
    }
    if (!contentType.includes("application/json")) {
      if (apiOptional && response.ok && contentType.includes("text/html")) return null
      throw new Error("추천 서버에 연결하지 못했어요.")
    }

    let payload: TripPlanPayload
    try {
      payload = (await response.json()) as TripPlanPayload
    } catch {
      throw new Error("추천 서버가 올바르지 않은 응답을 보냈어요.")
    }
    if (!response.ok) {
      throw new Error(payload.error?.message ?? "근거 데이터를 조회하지 못했어요.")
    }
    if (!isTripPlan(payload.plan)) {
      throw new Error("추천 서버 응답에 코스 정보가 없어요.")
    }
    return payload.plan
  } catch (error) {
    if (signal?.aborted) throw error
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("추천 서버 응답 시간이 초과됐어요.")
    }
    if (apiOptional && error instanceof TypeError) return null
    throw error
  } finally {
    window.clearTimeout(timeout)
    signal?.removeEventListener("abort", forwardAbort)
  }
}
