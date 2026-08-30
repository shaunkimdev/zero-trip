import type { GeoPoint } from "../../../src/types/trip.ts"
import type { KmaConfig } from "../shared/config.ts"
import {
  requestJson,
  ToolHttpError,
  type Fetch,
} from "../shared/http-client.ts"
import { publicDataItems, setPublicDataServiceKey } from "../shared/public-data.ts"

const FORECAST_URL =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst"
const VILLAGE_FORECAST_URL =
  "https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst"
const SEOUL_TIME_ZONE = "Asia/Seoul"
const PAGE_SIZE = 1_000
const MAX_PAGES = 10
const HOUR_MS = 60 * 60 * 1_000

interface KmaEnvelope {
  response?: {
    header?: { resultCode?: string; resultMsg?: string }
    body?: { items?: unknown; totalCount?: number | string }
  }
  OpenAPI_ServiceResponse?: {
    cmmMsgHeader?: {
      errMsg?: string
      returnAuthMsg?: string
      returnReasonCode?: string | number
    }
  }
}

interface ForecastRequest {
  location: GeoPoint
  date: string
  startTime: string
  endTime: string
}

export interface KmaForecastPoint {
  date: string
  time: string
  temperatureC?: number
  humidityPercent?: number
  precipitationProbabilityPercent?: number
  precipitationType?: number
  precipitationMm?: number
  sky?: number
  windSpeedMps?: number
  lightning?: number
}

export interface KmaForecast {
  issuedAt: string
  points: readonly KmaForecastPoint[]
}

interface IssueSlot {
  date: string
  time: string
  timestamp: number
}

type ForecastSource = "ultra" | "village"

class KmaResponseError extends ToolHttpError {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message, null, "kma")
    this.name = "KmaResponseError"
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function finiteNumber(value: unknown): number | undefined {
  const parsed = typeof value === "number" ? value : Number(value)
  return Number.isFinite(parsed) && parsed > -900 && parsed < 900
    ? parsed
    : undefined
}

function parseRainAmount(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined
  const normalized = String(value).trim()
  if (!normalized || normalized === "-" || normalized.includes("강수없음")) return 0
  if (/^(?:0|0\.0)(?:mm)?$/i.test(normalized)) return 0
  if (normalized.includes("미만")) return 0.5
  const numbers = normalized.match(/\d+(?:\.\d+)?/g)?.map(Number) ?? []
  if (numbers.length === 0) return undefined
  return Math.max(...numbers)
}

function kstParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SEOUL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((item) => item.type === type)?.value ?? 0)
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
  }
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function ultraIssueSlot(now: Date, cyclesBack = 0): IssueSlot {
  const current = kstParts(now)
  const currentKstAsUtc = Date.UTC(
    current.year,
    current.month - 1,
    current.day,
    current.hour,
    current.minute,
  )
  const latestHourOffset = current.minute >= 45 ? 0 : -1
  const timestamp = currentKstAsUtc + (latestHourOffset - cyclesBack) * HOUR_MS
  const slot = new Date(timestamp)
  return {
    timestamp,
    date: `${slot.getUTCFullYear()}${pad(slot.getUTCMonth() + 1)}${pad(slot.getUTCDate())}`,
    time: `${pad(slot.getUTCHours())}30`,
  }
}

function villageIssueSlot(now: Date, cyclesBack = 0): IssueSlot {
  const current = kstParts(now)
  const currentKstAsUtc = Date.UTC(
    current.year,
    current.month - 1,
    current.day,
    current.hour,
    current.minute,
  )
  // 단기예보는 02·05·08·11·14·17·20·23시에 발표되고 10분 뒤 제공된다.
  const publishedAt = new Date(currentKstAsUtc - 10 * 60 * 1_000)
  const hoursSinceSlot = (publishedAt.getUTCHours() - 2 + 3) % 3
  const timestamp =
    Date.UTC(
      publishedAt.getUTCFullYear(),
      publishedAt.getUTCMonth(),
      publishedAt.getUTCDate(),
      publishedAt.getUTCHours() - hoursSinceSlot,
    ) -
    cyclesBack * 3 * HOUR_MS
  const slot = new Date(timestamp)
  return {
    timestamp,
    date: `${slot.getUTCFullYear()}${pad(slot.getUTCMonth() + 1)}${pad(slot.getUTCDate())}`,
    time: `${pad(slot.getUTCHours())}00`,
  }
}

function requestTimestamp(date: string, time: string): number {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!dateMatch || !timeMatch) throw new TypeError("KMA forecast date or time is invalid.")

  const year = Number(dateMatch[1])
  const month = Number(dateMatch[2])
  const day = Number(dateMatch[3])
  const hour = Number(timeMatch[1])
  const minute = Number(timeMatch[2])
  const dateStart = Date.UTC(year, month - 1, day)
  const normalizedDate = new Date(dateStart)
  if (
    normalizedDate.getUTCFullYear() !== year ||
    normalizedDate.getUTCMonth() !== month - 1 ||
    normalizedDate.getUTCDate() !== day ||
    hour < 0 ||
    hour > 24 ||
    minute < 0 ||
    minute > 59 ||
    (hour === 24 && minute !== 0)
  ) {
    throw new TypeError("KMA forecast date or time is invalid.")
  }
  return dateStart + (hour * 60 + minute) * 60 * 1_000
}

function forecastTimestamp(date: unknown, time: unknown): number | undefined {
  const normalizedDate = String(date ?? "").replaceAll("-", "")
  const normalizedTime = String(time ?? "").padStart(4, "0")
  if (!/^\d{8}$/.test(normalizedDate) || !/^\d{4}$/.test(normalizedTime)) {
    return undefined
  }
  const year = Number(normalizedDate.slice(0, 4))
  const month = Number(normalizedDate.slice(4, 6))
  const day = Number(normalizedDate.slice(6, 8))
  const hour = Number(normalizedTime.slice(0, 2))
  const minute = Number(normalizedTime.slice(2, 4))
  if (hour > 23 || minute > 59) return undefined
  const timestamp = Date.UTC(year, month - 1, day, hour, minute)
  const parsed = new Date(timestamp)
  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? timestamp
    : undefined
}

function sourceForRequest(request: ForecastRequest, now: Date): ForecastSource {
  const start = requestTimestamp(request.date, request.startTime)
  const end = requestTimestamp(request.date, request.endTime)
  if (end < start) throw new RangeError("KMA forecast end time must not precede start time.")

  const slot = ultraIssueSlot(now)
  // HH:30 발표의 초단기예보는 다음 정시부터 여섯 개 시각(H+1~H+6)을 제공한다.
  const lastUltraForecast = slot.timestamp + 5.5 * HOUR_MS
  return start >= slot.timestamp && end <= lastUltraForecast ? "ultra" : "village"
}

export function latLonToKmaGrid(location: GeoPoint) {
  if (
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lng) ||
    location.lat < 30 ||
    location.lat > 44 ||
    location.lng < 120 ||
    location.lng > 135
  ) {
    throw new RangeError("KMA forecast coordinates must be within the Korean peninsula.")
  }

  const degrees = Math.PI / 180
  const re = 6371.00877 / 5
  const slat1 = 30 * degrees
  const slat2 = 60 * degrees
  const olon = 126 * degrees
  const olat = 38 * degrees
  let sn =
    Math.tan(Math.PI / 4 + slat2 / 2) /
    Math.tan(Math.PI / 4 + slat1 / 2)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)
  let sf = Math.tan(Math.PI / 4 + slat1 / 2)
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn
  let ro = Math.tan(Math.PI / 4 + olat / 2)
  ro = (re * sf) / Math.pow(ro, sn)
  let ra = Math.tan(Math.PI / 4 + (location.lat * degrees) / 2)
  ra = (re * sf) / Math.pow(ra, sn)
  let theta = location.lng * degrees - olon
  if (theta > Math.PI) theta -= 2 * Math.PI
  if (theta < -Math.PI) theta += 2 * Math.PI
  theta *= sn
  const grid = {
    nx: Math.floor(ra * Math.sin(theta) + 43 + 0.5),
    ny: Math.floor(ro - ra * Math.cos(theta) + 136 + 0.5),
  }
  if (grid.nx < 1 || grid.nx > 149 || grid.ny < 1 || grid.ny > 253) {
    throw new RangeError("KMA forecast coordinates fall outside the official grid.")
  }
  return grid
}

function normalizeForecast(
  items: readonly unknown[],
  request: ForecastRequest,
): KmaForecastPoint[] {
  const start = requestTimestamp(request.date, request.startTime)
  const end = requestTimestamp(request.date, request.endTime)
  const grouped = new Map<string, Record<string, unknown>>()

  for (const value of items) {
    const row = object(value)
    const forecastDate = String(row?.fcstDate ?? "").replaceAll("-", "")
    const forecastTime = String(row?.fcstTime ?? "").padStart(4, "0")
    const category = typeof row?.category === "string" ? row.category : ""
    const timestamp = forecastTimestamp(forecastDate, forecastTime)
    if (
      timestamp === undefined ||
      timestamp < start ||
      timestamp > end ||
      !category
    ) {
      continue
    }
    const key = `${forecastDate}-${forecastTime}`
    const categories = grouped.get(key) ?? {}
    categories[category] = row?.fcstValue
    grouped.set(key, categories)
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, categories]) => ({
      date: `${key.slice(0, 4)}-${key.slice(4, 6)}-${key.slice(6, 8)}`,
      time: `${key.slice(9, 11)}:${key.slice(11, 13)}`,
      temperatureC: finiteNumber(categories.T1H ?? categories.TMP),
      humidityPercent: finiteNumber(categories.REH),
      precipitationProbabilityPercent: finiteNumber(categories.POP),
      precipitationType: finiteNumber(categories.PTY),
      precipitationMm: parseRainAmount(categories.RN1 ?? categories.PCP),
      sky: finiteNumber(categories.SKY),
      windSpeedMps: finiteNumber(categories.WSD),
      lightning: finiteNumber(categories.LGT),
    }))
}

export class KmaClient {
  constructor(
    private readonly config: KmaConfig,
    private readonly fetchImplementation: Fetch = fetch,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async forecast(request: ForecastRequest): Promise<KmaForecast> {
    const grid = latLonToKmaGrid(request.location)
    const now = this.now()
    const source = sourceForRequest(request, now)

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const slot = source === "ultra"
        ? ultraIssueSlot(now, attempt)
        : villageIssueSlot(now, attempt)
      try {
        const items = await this.fetchItems(source, slot, grid)
        if (items.length === 0 && attempt === 0) continue
        const points = normalizeForecast(items, request)
        return {
          issuedAt: `${slot.date.slice(0, 4)}-${slot.date.slice(4, 6)}-${slot.date.slice(6, 8)}T${slot.time.slice(0, 2)}:${slot.time.slice(2)}:00+09:00`,
          points,
        }
      } catch (error) {
        if (attempt === 0 && error instanceof KmaResponseError && error.code === "03") {
          continue
        }
        throw error
      }
    }

    throw new ToolHttpError("KMA returned no usable forecast data.", null, "kma")
  }

  private async fetchItems(
    source: ForecastSource,
    slot: IssueSlot,
    grid: { nx: number; ny: number },
  ) {
    const first = await this.fetchPage(source, slot, grid, 1)
    this.assertSuccess(first)
    const items = [...publicDataItems(first.response?.body?.items)]
    const totalCount = Number(first.response?.body?.totalCount)
    if (!Number.isFinite(totalCount) || totalCount <= items.length) return items

    const pageCount = Math.min(MAX_PAGES, Math.ceil(totalCount / PAGE_SIZE))
    for (let pageNo = 2; pageNo <= pageCount; pageNo += 1) {
      const page = await this.fetchPage(source, slot, grid, pageNo)
      this.assertSuccess(page)
      const pageItems = publicDataItems(page.response?.body?.items)
      items.push(...pageItems)
      if (pageItems.length === 0 || items.length >= totalCount) break
    }
    return items
  }

  private assertSuccess(envelope: KmaEnvelope) {
    const gatewayHeader = envelope.OpenAPI_ServiceResponse?.cmmMsgHeader
    if (gatewayHeader) {
      const code = String(gatewayHeader.returnReasonCode ?? "UNKNOWN")
      throw new KmaResponseError(
        code,
        `KMA rejected the forecast request (${code}: ${gatewayHeader.returnAuthMsg ?? gatewayHeader.errMsg ?? "UNKNOWN"}).`,
      )
    }

    const header = envelope.response?.header
    if (header?.resultCode !== "00") {
      const code = header?.resultCode ?? "UNKNOWN"
      throw new KmaResponseError(
        code,
        `KMA rejected the forecast request (${code}: ${header?.resultMsg ?? "UNKNOWN"}).`,
      )
    }
  }

  private fetchPage(
    source: ForecastSource,
    slot: IssueSlot,
    grid: { nx: number; ny: number },
    pageNo: number,
  ) {
    const url = new URL(source === "ultra" ? FORECAST_URL : VILLAGE_FORECAST_URL)
    setPublicDataServiceKey(url, this.config.serviceKey)
    url.searchParams.set("pageNo", String(pageNo))
    url.searchParams.set("numOfRows", String(PAGE_SIZE))
    url.searchParams.set("dataType", "JSON")
    url.searchParams.set("base_date", slot.date)
    url.searchParams.set("base_time", slot.time)
    url.searchParams.set("nx", String(grid.nx))
    url.searchParams.set("ny", String(grid.ny))
    return requestJson<KmaEnvelope>(
      url.toString(),
      { method: "GET", headers: { Accept: "application/json" } },
      {
        tool: "kma",
        timeoutMs: this.config.requestTimeoutMs,
        fetchImplementation: this.fetchImplementation,
      },
    )
  }
}

export function summarizeKmaForecast(forecast: KmaForecast) {
  const points = forecast.points
  const precipitation = points.some(
    (point) =>
      (point.precipitationType ?? 0) > 0 ||
      (point.precipitationMm ?? 0) > 0 ||
      (point.precipitationProbabilityPercent ?? 0) >= 70,
  )
  const heavyPrecipitation = points.some(
    (point) => (point.precipitationMm ?? 0) >= 20,
  )
  const strongWind = points.some((point) => (point.windSpeedMps ?? 0) >= 9)
  const lightning = points.some((point) => (point.lightning ?? 0) > 0)
  const extremeTemperature = points.some(
    (point) => (point.temperatureC ?? 20) >= 35 || (point.temperatureC ?? 20) <= -12,
  )
  const temperatures = points.flatMap((point) =>
    point.temperatureC === undefined ? [] : [point.temperatureC],
  )
  return {
    outdoorRisk: heavyPrecipitation || strongWind || lightning || extremeTemperature,
    precipitation,
    heavyPrecipitation,
    strongWind,
    lightning,
    extremeTemperature,
    minimumTemperatureC:
      temperatures.length > 0 ? Math.min(...temperatures) : undefined,
    maximumTemperatureC:
      temperatures.length > 0 ? Math.max(...temperatures) : undefined,
  }
}
