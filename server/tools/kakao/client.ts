import type { GeoPoint } from "../../../src/types/trip.ts"
import type { KakaoConfig } from "../shared/config.ts"
import {
  requestJson,
  ToolHttpError,
  type Fetch,
} from "../shared/http-client.ts"

const KEYWORD_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"
const WALKING_ROUTE_URL = "https://dapi.kakao.com/v2/routing/walk"

interface KakaoSearchEnvelope {
  documents?: unknown[]
}

interface KakaoWalkingEnvelope {
  status?: string
  route?: {
    properties?: {
      totalDistance?: number
      totalTime?: number
      landingUrl?: string
    }
    legs?: unknown[]
  }
}

export interface KakaoPlace {
  id: string
  name: string
  categoryName: string
  categoryGroupCode?: string
  address: string
  location: GeoPoint
  placeUrl?: string
  distanceMeters?: number
}

export interface KakaoWalkingLeg {
  distanceMeters: number
  durationMinutes: number
}

export interface KakaoWalkingRoute {
  distanceMeters: number
  durationMinutes: number
  directionsUrl?: string
  legs: readonly KakaoWalkingLeg[]
}

export type KakaoWalkingRouteMode = "BROAD_FIRST" | "SHORTEST" | "ACCESSIBLE"

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined
}

function httpUrl(value: unknown): string | undefined {
  const candidate = text(value)
  if (!candidate) return undefined
  try {
    const url = new URL(candidate)
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined
  } catch {
    return undefined
  }
}

function kakaoHttpsUrl(value: unknown): string | undefined {
  const candidate = httpUrl(value)
  if (!candidate) return undefined
  const url = new URL(candidate)
  const hostname = url.hostname.toLowerCase()
  return url.protocol === "https:" &&
    (hostname === "kakao.com" || hostname.endsWith(".kakao.com"))
    ? url.toString()
    : undefined
}

function normalizePlace(value: unknown): KakaoPlace | null {
  const row = object(value)
  const id = text(row?.id)
  const name = text(row?.place_name)
  const categoryName = text(row?.category_name)
  const lat = Number(row?.y)
  const lng = Number(row?.x)
  if (
    !id ||
    !name ||
    !categoryName ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null
  }
  const distanceMeters = Number(row?.distance)
  return {
    id,
    name,
    categoryName,
    categoryGroupCode: text(row?.category_group_code),
    address: text(row?.road_address_name) ?? text(row?.address_name) ?? "주소 정보 없음",
    location: { lat, lng },
    placeUrl: kakaoHttpsUrl(row?.place_url),
    distanceMeters:
      Number.isFinite(distanceMeters) && distanceMeters >= 0
        ? distanceMeters
        : undefined,
  }
}

function assertCoordinate(point: GeoPoint, label: string) {
  if (
    !Number.isFinite(point.lat) ||
    !Number.isFinite(point.lng) ||
    point.lat < -90 ||
    point.lat > 90 ||
    point.lng < -180 ||
    point.lng > 180
  ) {
    throw new RangeError(`${label} coordinates are invalid.`)
  }
}

export class KakaoClient {
  constructor(
    private readonly config: KakaoConfig,
    private readonly fetchImplementation: Fetch = fetch,
  ) {}

  async searchKeyword(
    query: string,
    center: GeoPoint,
    radiusMeters = 1_000,
    size = 5,
  ): Promise<readonly KakaoPlace[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery || normalizedQuery.length > 100) {
      throw new TypeError("Kakao place search requires a query of at most 100 characters.")
    }
    assertCoordinate(center, "Kakao search center")
    const url = new URL(KEYWORD_URL)
    url.searchParams.set("query", normalizedQuery)
    url.searchParams.set("x", String(center.lng))
    url.searchParams.set("y", String(center.lat))
    url.searchParams.set("radius", String(Math.max(1, Math.min(20_000, Math.round(radiusMeters)))))
    url.searchParams.set("size", String(Math.max(1, Math.min(15, Math.round(size)))))
    url.searchParams.set("sort", "distance")
    const envelope = await this.request<KakaoSearchEnvelope>(url)
    const documents = Array.isArray(envelope.documents) ? envelope.documents : []
    return documents.flatMap((item) => {
      const place = normalizePlace(item)
      return place ? [place] : []
    })
  }

  async walkingRoute(
    points: readonly GeoPoint[],
    mode: KakaoWalkingRouteMode = "BROAD_FIRST",
  ): Promise<KakaoWalkingRoute> {
    if (points.length < 2 || points.length > 7) {
      throw new RangeError("A Kakao walking route requires 2 to 7 points.")
    }
    points.forEach((point, index) => assertCoordinate(point, `Kakao route point ${index + 1}`))
    const start = points[0]
    const end = points.at(-1)!
    const vias = points.slice(1, -1)
    const url = new URL(WALKING_ROUTE_URL)
    url.searchParams.set("start_x", String(start.lng))
    url.searchParams.set("start_y", String(start.lat))
    url.searchParams.set("end_x", String(end.lng))
    url.searchParams.set("end_y", String(end.lat))
    if (vias.length > 0) {
      url.searchParams.set("via_x", vias.map((point) => point.lng).join(","))
      url.searchParams.set("via_y", vias.map((point) => point.lat).join(","))
    }
    url.searchParams.set("input_coord", "WGS84")
    url.searchParams.set("output_coord", "WGS84")
    url.searchParams.set("route_mode", mode)

    const envelope = await this.request<KakaoWalkingEnvelope>(url)
    const properties = envelope.route?.properties
    const distanceMeters = finite(properties?.totalDistance)
    const totalTimeSeconds = finite(properties?.totalTime)
    if (envelope.status !== "OK" || distanceMeters === undefined || totalTimeSeconds === undefined) {
      throw new ToolHttpError(
        `Kakao could not find a walking route (${envelope.status ?? "UNKNOWN"}).`,
        null,
        "kakao",
      )
    }
    const routeLegs = Array.isArray(envelope.route?.legs) ? envelope.route.legs : []
    const legs = routeLegs.flatMap((value) => {
      const row = object(value)
      const legProperties = object(row?.properties)
      const distance = finite(legProperties?.distance)
      const timeSeconds = finite(legProperties?.time)
      return distance === undefined || timeSeconds === undefined
        ? []
        : [{ distanceMeters: Math.round(distance), durationMinutes: Math.ceil(timeSeconds / 60) }]
    })
    if (legs.length !== points.length - 1) {
      throw new ToolHttpError("Kakao returned an incomplete walking route.", null, "kakao")
    }
    return {
      distanceMeters: Math.round(distanceMeters),
      durationMinutes: Math.ceil(totalTimeSeconds / 60),
      directionsUrl: kakaoHttpsUrl(properties?.landingUrl),
      legs,
    }
  }

  private request<T>(url: URL): Promise<T> {
    return requestJson<T>(
      url.toString(),
      {
        method: "GET",
        headers: {
          Accept: "application/json",
          Authorization: `KakaoAK ${this.config.apiKey}`,
        },
      },
      {
        tool: "kakao",
        timeoutMs: this.config.requestTimeoutMs,
        fetchImplementation: this.fetchImplementation,
      },
    )
  }
}
