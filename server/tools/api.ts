import { timingSafeEqual } from "node:crypto"
import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"

import { ToolHttpError } from "./shared/http-client.ts"
import { loadToolConfig, type ZeroTripToolConfig } from "./shared/config.ts"
import { ToolManagerError, ZeroTripToolManager } from "./tool-manager.ts"
import { parseTripRequest } from "./trip-request.ts"
import type { AirbyteSyncTarget } from "./airbyte/service.ts"

type Environment = Readonly<Record<string, string | undefined>>
type ApiLimits = ZeroTripToolConfig["api"]

const MAX_BODY_BYTES = 64 * 1_024
const syncTargets = new Set<AirbyteSyncTarget>(["main-db", "ragflow"])

interface RateBucket {
  count: number
  windowStartedAt: number
}

class PlanAdmissionController {
  private active = 0
  private readonly buckets = new Map<string, RateBucket>()

  constructor(private readonly limits: ApiLimits) {}

  enter(
    request: IncomingMessage,
  ):
    | { accepted: false; retryAfterSeconds: number }
    | { accepted: true; release: () => void } {
    const now = Date.now()
    if (this.buckets.size >= 5_000) {
      for (const [bucketKey, bucketValue] of this.buckets) {
        if (now - bucketValue.windowStartedAt >= 60_000) this.buckets.delete(bucketKey)
      }
      while (this.buckets.size >= 10_000) {
        const oldestKey = this.buckets.keys().next().value as string | undefined
        if (!oldestKey) break
        this.buckets.delete(oldestKey)
      }
    }
    const key = request.socket.remoteAddress ?? "unknown"
    const current = this.buckets.get(key)
    const bucket =
      current && now - current.windowStartedAt < 60_000
        ? current
        : { count: 0, windowStartedAt: now }
    if (bucket.count >= this.limits.planRateLimitPerMinute) {
      return {
        accepted: false,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((60_000 - (now - bucket.windowStartedAt)) / 1_000),
        ),
      }
    }
    if (this.active >= this.limits.planMaxConcurrency) {
      return { accepted: false, retryAfterSeconds: 5 }
    }

    bucket.count += 1
    this.buckets.set(key, bucket)
    this.active += 1
    let released = false
    return {
      accepted: true,
      release: () => {
        if (released) return
        released = true
        this.active -= 1
      },
    }
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

function json(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader("Content-Type", "application/json; charset=utf-8")
  response.setHeader("Cache-Control", "no-store")
  response.setHeader("X-Content-Type-Options", "nosniff")
  response.end(JSON.stringify(payload))
}

function methodNotAllowed(response: ServerResponse, allowed: string) {
  response.setHeader("Allow", allowed)
  json(response, 405, {
    error: { code: "METHOD_NOT_ALLOWED", message: `Use ${allowed} for this endpoint.` },
  })
}

function requireJsonContent(request: IncomingMessage) {
  const contentType = (request.headers["content-type"] ?? "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase()
  if (contentType !== "application/json") {
    throw new ApiError(
      "Content-Type은 application/json이어야 합니다.",
      "UNSUPPORTED_MEDIA_TYPE",
      415,
    )
  }
}

async function readJson(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += buffer.byteLength
    if (size > MAX_BODY_BYTES) {
      throw new ApiError("요청 본문이 너무 큽니다.", "BODY_TOO_LARGE", 413)
    }
    chunks.push(buffer)
  }
  if (chunks.length === 0) throw new ApiError("JSON 요청 본문이 필요합니다.", "EMPTY_BODY", 400)
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown
  } catch {
    throw new ApiError("요청 본문이 올바른 JSON이 아닙니다.", "INVALID_JSON", 400)
  }
}

function record(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ApiError("요청 본문은 JSON 객체여야 합니다.", "INVALID_BODY", 400)
  }
  return value as Record<string, unknown>
}

function tokenMatches(supplied: string, expected: string) {
  const suppliedBytes = Buffer.from(supplied)
  const expectedBytes = Buffer.from(expected)
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  )
}

function requireAdmin(
  request: IncomingMessage,
  response: ServerResponse,
  adminToken: string | null,
) {
  if (!adminToken) {
    json(response, 503, {
      error: {
        code: "ADMIN_API_DISABLED",
        message: "ZERO_TRIP_TOOLS_ADMIN_TOKEN이 설정되지 않았습니다.",
      },
    })
    return false
  }
  const authorization = request.headers.authorization ?? ""
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : ""
  if (!supplied || !tokenMatches(supplied, adminToken)) {
    response.setHeader("WWW-Authenticate", "Bearer")
    json(response, 401, {
      error: { code: "UNAUTHORIZED", message: "관리자 인증이 필요합니다." },
    })
    return false
  }
  return true
}

function syncRequest(payload: unknown) {
  const body = record(payload)
  const target = body.target
  if (typeof target !== "string" || !syncTargets.has(target as AirbyteSyncTarget)) {
    throw new ApiError("지원하지 않는 Airbyte 동기화 대상입니다.", "INVALID_TARGET", 400)
  }
  const connectionId = body.connectionId
  if (
    connectionId !== undefined &&
    (typeof connectionId !== "string" || !connectionId.trim() || connectionId.length > 100)
  ) {
    throw new ApiError("connectionId가 올바르지 않습니다.", "INVALID_CONNECTION", 400)
  }
  return {
    target: target as AirbyteSyncTarget,
    connectionId: typeof connectionId === "string" ? connectionId.trim() : undefined,
  }
}

function errorResponse(response: ServerResponse, error: unknown) {
  if (error instanceof ApiError || error instanceof ToolManagerError) {
    json(response, error.statusCode, {
      error: { code: error.code, message: error.message },
    })
    return
  }
  if (error instanceof TypeError || error instanceof RangeError) {
    json(response, 400, {
      error: { code: "INVALID_REQUEST", message: error.message },
    })
    return
  }
  if (error instanceof ToolHttpError) {
    json(response, 502, {
      error: { code: `${error.tool.toUpperCase()}_UPSTREAM_ERROR`, message: error.message },
    })
    return
  }
  json(response, 500, {
    error: { code: "INTERNAL_ERROR", message: "도구 요청을 처리하지 못했습니다." },
  })
}

export function createToolsMiddleware(
  manager: ZeroTripToolManager,
  adminToken: string | null,
  limits: ApiLimits = { planRateLimitPerMinute: 20, planMaxConcurrency: 8 },
) {
  const planAdmission = new PlanAdmissionController(limits)
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    const url = new URL(request.url ?? "/", "http://localhost")
    const jobMatch = /^\/api\/admin\/tools\/airbyte\/jobs\/(\d+)$/.exec(url.pathname)
    const isKnownPath =
      url.pathname === "/api/tools/status" ||
      url.pathname === "/api/trips/plan" ||
      url.pathname === "/api/admin/tools/airbyte/sync" ||
      jobMatch !== null
    if (!isKnownPath) {
      next()
      return
    }

    try {
      if (url.pathname === "/api/tools/status") {
        if (request.method !== "GET") return methodNotAllowed(response, "GET")
        json(response, 200, manager.status())
        return
      }

      if (url.pathname === "/api/trips/plan") {
        if (request.method !== "POST") return methodNotAllowed(response, "POST")
        requireJsonContent(request)
        const admission = planAdmission.enter(request)
        if (!admission.accepted) {
          response.setHeader("Retry-After", String(admission.retryAfterSeconds))
          json(response, 429, {
            error: {
              code: "TOO_MANY_REQUESTS",
              message: "추천 요청이 많습니다. 잠시 후 다시 시도해 주세요.",
            },
          })
          return
        }
        try {
          const tripRequest = parseTripRequest(await readJson(request))
          const plan = await manager.planTrip(tripRequest)
          json(response, 200, { plan })
        } finally {
          admission.release()
        }
        return
      }

      if (!requireAdmin(request, response, adminToken)) return

      if (url.pathname === "/api/admin/tools/airbyte/sync") {
        if (request.method !== "POST") return methodNotAllowed(response, "POST")
        requireJsonContent(request)
        const { target, connectionId } = syncRequest(await readJson(request))
        const results = await manager.triggerAirbyte(target, connectionId)
        const statusCode = results.every((result) => result.outcome === "failed") ? 502 : 202
        json(response, statusCode, { results })
        return
      }

      if (jobMatch) {
        if (request.method !== "GET") return methodNotAllowed(response, "GET")
        const job = await manager.getAirbyteJob(jobMatch[1])
        json(response, 200, { job })
      }
    } catch (error) {
      errorResponse(response, error)
    }
  }
}

export function zeroTripToolsApi(environment: Environment): Plugin {
  const config = loadToolConfig(environment)
  const manager = new ZeroTripToolManager(config)
  const middleware = createToolsMiddleware(manager, config.adminToken, config.api)

  return {
    name: "zero-trip-tools-api",
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}
