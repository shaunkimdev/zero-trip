import type { GeoPoint } from "../../../src/types/trip.ts"
import type { TourApiConfig } from "../shared/config.ts"
import {
  requestJson,
  ToolHttpError,
  type Fetch,
} from "../shared/http-client.ts"
import { publicDataItems, setPublicDataServiceKey } from "../shared/public-data.ts"

const LOCATION_URL =
  "https://apis.data.go.kr/B551011/KorService2/locationBasedList2"
const SEARCH_URL =
  "https://apis.data.go.kr/B551011/KorService2/searchKeyword2"
const IMAGE_URL =
  "https://apis.data.go.kr/B551011/KorService2/detailImage2"
const CACHE_TTL_MS = 15 * 60 * 1_000
const MAX_CACHE_ENTRIES = 128

interface TourApiEnvelope {
  response?: {
    header?: { resultCode?: string; resultMsg?: string }
    body?: { items?: unknown; totalCount?: number }
  }
}

export interface TourApiPlace {
  contentId: string
  contentTypeId?: string
  title: string
  address: string
  location: GeoPoint
  modifiedAt?: string
}

export interface TourApiImage {
  url: string
  thumbnailUrl?: string
  alt: string
}

interface CacheEntry {
  expiresAt: number
  value: readonly TourApiPlace[]
}

interface ImageCacheEntry {
  expiresAt: number
  value: readonly TourApiImage[]
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

function modifiedAt(value: unknown): string | undefined {
  const raw = text(value)
  const match = raw && /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(raw)
  if (!match) return undefined
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+09:00`
}

function publicImageUrl(value: unknown): string | undefined {
  const raw = text(value)
  if (!raw) return undefined
  try {
    const url = new URL(raw)
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined
    if (url.protocol === "http:") url.protocol = "https:"
    return url.toString()
  } catch {
    return undefined
  }
}

function normalizeImage(
  value: unknown,
  expectedContentId: string,
): TourApiImage | null {
  const row = object(value)
  const returnedContentId = text(row?.contentid)
  if (returnedContentId && returnedContentId !== expectedContentId) return null
  const url = publicImageUrl(row?.originimgurl)
  if (!url) return null
  const thumbnailUrl = publicImageUrl(row?.smallimageurl)
  return {
    url,
    ...(thumbnailUrl ? { thumbnailUrl } : {}),
    alt: text(row?.imgname) ?? "관광지 대표사진",
  }
}

function normalizePlace(value: unknown): TourApiPlace | null {
  const row = object(value)
  const contentId = text(row?.contentid)
  const title = text(row?.title)
  const lat = Number(row?.mapy)
  const lng = Number(row?.mapx)
  if (
    !contentId ||
    !title ||
    !Number.isFinite(lat) ||
    !Number.isFinite(lng) ||
    lat < -90 ||
    lat > 90 ||
    lng < -180 ||
    lng > 180
  ) {
    return null
  }
  return {
    contentId,
    contentTypeId: text(row?.contenttypeid),
    title,
    address: text(row?.addr1) ?? text(row?.addr2) ?? "주소 정보 없음",
    location: { lat, lng },
    modifiedAt: modifiedAt(row?.modifiedtime),
  }
}

export class TourApiClient {
  private readonly cache = new Map<string, CacheEntry>()
  private readonly imageCache = new Map<string, ImageCacheEntry>()

  constructor(
    private readonly config: TourApiConfig,
    private readonly fetchImplementation: Fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  async nearbyPlaces(
    location: GeoPoint,
    radiusMeters = 20_000,
    maximumResults = 100,
  ): Promise<readonly TourApiPlace[]> {
    if (
      !Number.isFinite(location.lat) ||
      !Number.isFinite(location.lng) ||
      location.lat < -90 ||
      location.lat > 90 ||
      location.lng < -180 ||
      location.lng > 180
    ) {
      throw new TypeError("TourAPI search coordinates are required.")
    }
    const radius = Math.max(1, Math.min(20_000, Math.round(radiusMeters)))
    const rows = Math.max(1, Math.min(100, Math.round(maximumResults)))
    const cacheKey = `nearby:${location.lat.toFixed(3)}:${location.lng.toFixed(3)}:${radius}:${rows}`
    const now = this.now()
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key)
    }
    const cached = this.cache.get(cacheKey)
    if (cached) return cached.value

    const url = new URL(LOCATION_URL)
    setPublicDataServiceKey(url, this.config.serviceKey)
    url.searchParams.set("MobileOS", "ETC")
    url.searchParams.set("MobileApp", "ZERO_TRIP")
    url.searchParams.set("_type", "json")
    url.searchParams.set("mapX", String(location.lng))
    url.searchParams.set("mapY", String(location.lat))
    url.searchParams.set("radius", String(radius))
    url.searchParams.set("arrange", "E")
    url.searchParams.set("numOfRows", String(rows))
    url.searchParams.set("pageNo", "1")

    const envelope = await requestJson<TourApiEnvelope>(
      url.toString(),
      { method: "GET", headers: { Accept: "application/json" } },
      {
        tool: "tour-api",
        timeoutMs: this.config.requestTimeoutMs,
        fetchImplementation: this.fetchImplementation,
      },
    )
    const resultCode = envelope.response?.header?.resultCode
    if (resultCode !== "0000" && resultCode !== "00") {
      throw new ToolHttpError(
        `TourAPI rejected the nearby-place request (${resultCode ?? "UNKNOWN"}).`,
        null,
        "tour-api",
      )
    }
    const places = publicDataItems(envelope.response?.body?.items).flatMap((item) => {
      const place = normalizePlace(item)
      return place ? [place] : []
    })
    while (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined
      if (oldestKey === undefined) break
      this.cache.delete(oldestKey)
    }
    this.cache.set(cacheKey, { expiresAt: this.now() + CACHE_TTL_MS, value: places })
    return places
  }

  async searchPlaces(
    keyword: string,
    maximumResults = 10,
  ): Promise<readonly TourApiPlace[]> {
    const query = keyword.trim()
    if (!query) throw new TypeError("TourAPI search keyword is required.")
    const rows = Math.max(1, Math.min(30, Math.round(maximumResults)))
    const cacheKey = `search:${query.toLocaleLowerCase("ko-KR")}:${rows}`
    const now = this.now()
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) this.cache.delete(key)
    }
    const cached = this.cache.get(cacheKey)
    if (cached) return cached.value

    const url = new URL(SEARCH_URL)
    setPublicDataServiceKey(url, this.config.serviceKey)
    url.searchParams.set("MobileOS", "ETC")
    url.searchParams.set("MobileApp", "ZERO_TRIP")
    url.searchParams.set("_type", "json")
    url.searchParams.set("keyword", query)
    url.searchParams.set("areaCode", "1")
    url.searchParams.set("arrange", "A")
    url.searchParams.set("numOfRows", String(rows))
    url.searchParams.set("pageNo", "1")

    const envelope = await requestJson<TourApiEnvelope>(
      url.toString(),
      { method: "GET", headers: { Accept: "application/json" } },
      {
        tool: "tour-api",
        timeoutMs: this.config.requestTimeoutMs,
        fetchImplementation: this.fetchImplementation,
      },
    )
    const resultCode = envelope.response?.header?.resultCode
    if (resultCode !== "0000" && resultCode !== "00") {
      throw new ToolHttpError(
        `TourAPI rejected the keyword request (${resultCode ?? "UNKNOWN"}).`,
        null,
        "tour-api",
      )
    }
    const places = publicDataItems(envelope.response?.body?.items).flatMap((item) => {
      const place = normalizePlace(item)
      return place ? [place] : []
    })
    while (this.cache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.cache.keys().next().value as string | undefined
      if (oldestKey === undefined) break
      this.cache.delete(oldestKey)
    }
    this.cache.set(cacheKey, { expiresAt: this.now() + CACHE_TTL_MS, value: places })
    return places
  }

  async placeImages(
    contentId: string,
    maximumResults = 3,
  ): Promise<readonly TourApiImage[]> {
    const id = contentId.trim()
    if (!id) throw new TypeError("TourAPI content ID is required.")
    const rows = Math.max(1, Math.min(10, Math.round(maximumResults)))
    const cacheKey = `${id}:${rows}`
    const now = this.now()
    for (const [key, entry] of this.imageCache) {
      if (entry.expiresAt <= now) this.imageCache.delete(key)
    }
    const cached = this.imageCache.get(cacheKey)
    if (cached) return cached.value

    const url = new URL(IMAGE_URL)
    setPublicDataServiceKey(url, this.config.serviceKey)
    url.searchParams.set("MobileOS", "ETC")
    url.searchParams.set("MobileApp", "ZERO_TRIP")
    url.searchParams.set("_type", "json")
    url.searchParams.set("contentId", id)
    url.searchParams.set("imageYN", "Y")
    url.searchParams.set("numOfRows", String(rows))
    url.searchParams.set("pageNo", "1")

    const envelope = await requestJson<TourApiEnvelope>(
      url.toString(),
      { method: "GET", headers: { Accept: "application/json" } },
      {
        tool: "tour-api",
        timeoutMs: this.config.requestTimeoutMs,
        fetchImplementation: this.fetchImplementation,
      },
    )
    const resultCode = envelope.response?.header?.resultCode
    if (resultCode !== "0000" && resultCode !== "00") {
      throw new ToolHttpError(
        `TourAPI rejected the image request (${resultCode ?? "UNKNOWN"}).`,
        null,
        "tour-api",
      )
    }
    const seen = new Set<string>()
    const images = publicDataItems(envelope.response?.body?.items)
      .flatMap((item) => {
        const image = normalizeImage(item, id)
        if (!image || seen.has(image.url)) return []
        seen.add(image.url)
        return [image]
      })
      .slice(0, rows)
    while (this.imageCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = this.imageCache.keys().next().value as string | undefined
      if (oldestKey === undefined) break
      this.imageCache.delete(oldestKey)
    }
    this.imageCache.set(cacheKey, {
      expiresAt: this.now() + CACHE_TTL_MS,
      value: images,
    })
    return images
  }
}
