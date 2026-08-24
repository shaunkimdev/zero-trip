import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"

import { SEOUL_POPULATION_SPOTS, type SeoulPopulationSpot } from "../src/data/seoul-population-spots.ts"
import type {
  SeoulCongestionLevel,
  SeoulPopulationPoint,
  SeoulPopulationResponse,
} from "../src/types/seoul-population.ts"

const SEOUL_API_ORIGIN = "http://openapi.seoul.go.kr:8088"
const CACHE_TTL_MS = 5 * 60 * 1_000
const REQUEST_TIMEOUT_MS = 8_000
const MAX_CONCURRENCY = 4

const congestionLevels = new Set<SeoulCongestionLevel>([
  "여유",
  "보통",
  "약간 붐빔",
  "붐빔",
])

interface SeoulApiPopulationRow {
  AREA_NM?: string
  AREA_CD?: string
  AREA_CONGEST_LVL?: string
  AREA_CONGEST_MSG?: string
  AREA_PPLTN_MIN?: string
  AREA_PPLTN_MAX?: string
  PPLTN_TIME?: string
  REPLACE_YN?: string
}

interface SeoulApiPayload {
  "SeoulRtd.citydata_ppltn"?: SeoulApiPopulationRow[]
  RESULT?: {
    "RESULT.CODE"?: string
    "RESULT.MESSAGE"?: string
  }
}

interface PopulationCache {
  expiresAt: number
  response: SeoulPopulationResponse
}

function numericValue(value: string | undefined) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

async function fetchPopulationSpot(apiKey: string, spot: SeoulPopulationSpot) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const endpoint = `${SEOUL_API_ORIGIN}/${encodeURIComponent(apiKey)}/json/citydata_ppltn/1/5/${encodeURIComponent(spot.areaCode)}`

  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
    if (!response.ok) throw new Error(`Seoul API responded with ${response.status}`)

    const payload = (await response.json()) as SeoulApiPayload
    const row = payload["SeoulRtd.citydata_ppltn"]?.[0]
    if (!row) throw new Error(payload.RESULT?.["RESULT.MESSAGE"] ?? "Population row is missing")

    const congestionLevel = congestionLevels.has(row.AREA_CONGEST_LVL as SeoulCongestionLevel)
      ? (row.AREA_CONGEST_LVL as SeoulCongestionLevel)
      : "보통"

    return {
      areaCode: row.AREA_CD ?? spot.areaCode,
      areaName: row.AREA_NM ?? spot.areaName,
      label: spot.label,
      lat: spot.point[1],
      lng: spot.point[0],
      congestionLevel,
      congestionMessage: row.AREA_CONGEST_MSG ?? "",
      populationMin: numericValue(row.AREA_PPLTN_MIN),
      populationMax: numericValue(row.AREA_PPLTN_MAX),
      dataTime: row.PPLTN_TIME ?? "",
      replacement: row.REPLACE_YN === "Y",
    } satisfies SeoulPopulationPoint
  } finally {
    clearTimeout(timeout)
  }
}

async function fetchInBatches(apiKey: string, spots: readonly SeoulPopulationSpot[]) {
  const points: SeoulPopulationPoint[] = []

  for (let index = 0; index < spots.length; index += MAX_CONCURRENCY) {
    const batch = spots.slice(index, index + MAX_CONCURRENCY)
    const settled = await Promise.allSettled(batch.map((spot) => fetchPopulationSpot(apiKey, spot)))
    for (const result of settled) {
      if (result.status === "fulfilled") points.push(result.value)
    }
  }

  return points
}

function latestDataTime(points: readonly SeoulPopulationPoint[]) {
  return points.map((point) => point.dataTime).filter(Boolean).sort().at(-1) ?? null
}

function json(response: ServerResponse, statusCode: number, payload: SeoulPopulationResponse) {
  response.statusCode = statusCode
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "private, max-age=60")
  response.end(JSON.stringify(payload))
}

export function seoulPopulationApi(apiKeyValue?: string): Plugin {
  const configuredKey = apiKeyValue?.trim()
  const sampleMode = !configuredKey || configuredKey === "sample"
  const apiKey = configuredKey || "sample"
  let cache: PopulationCache | null = null

  const middleware = async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    if (url.pathname !== "/api/seoul-population") {
      next()
      return
    }

    if (request.method !== "GET") {
      response.statusCode = 405
      response.setHeader("Allow", "GET")
      response.end()
      return
    }

    if (cache && cache.expiresAt > Date.now()) {
      json(response, 200, cache.response)
      return
    }

    const targets = sampleMode
      ? SEOUL_POPULATION_SPOTS.filter((spot) => spot.areaCode === "POI009")
      : SEOUL_POPULATION_SPOTS

    try {
      const points = await fetchInBatches(apiKey, targets)
      const fetchedAt = new Date().toISOString()

      if (points.length === 0) {
        const failed: SeoulPopulationResponse = {
          status: sampleMode ? "unconfigured" : "error",
          points: [],
          dataTime: null,
          fetchedAt,
          message: sampleMode
            ? "서울 열린데이터광장 인증키가 필요합니다."
            : "서울시 실시간 인구 API 응답을 확인하지 못했습니다.",
        }
        json(response, 502, failed)
        return
      }

      const result: SeoulPopulationResponse = {
        status: sampleMode ? "sample" : "live",
        points,
        dataTime: latestDataTime(points),
        fetchedAt,
        message: sampleMode
          ? "샘플 키로 광화문·덕수궁 실시간 값만 표시 중입니다."
          : points.length < targets.length
            ? `${targets.length}개 주요 거점 중 ${points.length}개를 불러왔습니다.`
            : undefined,
      }
      cache = { expiresAt: Date.now() + CACHE_TTL_MS, response: result }
      json(response, 200, result)
    } catch {
      json(response, 502, {
        status: sampleMode ? "unconfigured" : "error",
        points: [],
        dataTime: null,
        fetchedAt: new Date().toISOString(),
        message: "서울시 실시간 인구 데이터를 불러오지 못했습니다.",
      })
    }
  }

  return {
    name: "zero-trip-seoul-population-api",
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
