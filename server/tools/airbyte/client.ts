import type { AirbyteConfig } from "../shared/config.ts"
import {
  requestJson,
  ToolHttpError,
  type Fetch,
} from "../shared/http-client.ts"

export const AIRBYTE_JOB_STATUSES = [
  "pending",
  "queued",
  "running",
  "incomplete",
  "failed",
  "succeeded",
  "cancelled",
] as const

export type AirbyteJobStatus = (typeof AIRBYTE_JOB_STATUSES)[number]

export interface AirbyteJob {
  jobId: string
  status: AirbyteJobStatus
  jobType: string
  connectionId?: string
  startTime?: string
  lastUpdatedAt?: string
  bytesSynced?: number
  rowsSynced?: number
}

interface AirbyteTokenResponse {
  access_token?: string
  expires_in?: number
}

interface CachedToken {
  value: string
  expiresAt: number
}

const jobStatuses = new Set<string>(AIRBYTE_JOB_STATUSES)
const TOKEN_EXPIRY_SKEW_MS = 60_000

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined
}

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function normalizeJob(payload: unknown): AirbyteJob {
  const row = object(payload)
  const jobId = row && (typeof row.jobId === "number" || typeof row.jobId === "string")
    ? String(row.jobId)
    : ""
  const status = row && typeof row.status === "string" ? row.status : ""
  const jobType = optionalString(row?.jobType)
  if (!/^\d+$/.test(jobId) || !jobStatuses.has(status) || jobType !== "sync") {
    throw new ToolHttpError("Airbyte returned an invalid job response.", null, "airbyte")
  }
  return {
    jobId,
    status: status as AirbyteJobStatus,
    jobType,
    connectionId: optionalString(row?.connectionId),
    startTime: optionalString(row?.startTime),
    lastUpdatedAt: optionalString(row?.lastUpdatedAt),
    bytesSynced: optionalNumber(row?.bytesSynced),
    rowsSynced: optionalNumber(row?.rowsSynced),
  }
}

export class AirbyteClient {
  private cachedToken: CachedToken | null = null
  private pendingToken: Promise<string> | null = null

  constructor(
    private readonly config: AirbyteConfig,
    private readonly fetchImplementation: Fetch = fetch,
  ) {}

  async triggerSync(connectionId: string): Promise<AirbyteJob> {
    if (!connectionId.trim()) throw new TypeError("Airbyte connection ID is required.")
    const response = await this.authorizedJson<unknown>(`${this.config.apiUrl}/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, jobType: "sync" }),
    })
    const job = normalizeJob(response)
    if (job.connectionId && job.connectionId !== connectionId) {
      throw new ToolHttpError(
        "Airbyte returned a job for a different connection.",
        null,
        "airbyte",
      )
    }
    return job
  }

  async getJob(jobId: string): Promise<AirbyteJob> {
    if (!/^\d+$/.test(jobId)) throw new TypeError("Airbyte job ID must be numeric.")
    const response = await this.authorizedJson<unknown>(
      `${this.config.apiUrl}/jobs/${encodeURIComponent(jobId)}`,
      { method: "GET" },
    )
    return normalizeJob(response)
  }

  async setCronSchedule(connectionId: string, cronExpression: string): Promise<void> {
    if (!connectionId.trim()) throw new TypeError("Airbyte connection ID is required.")
    if (!cronExpression.trim() || cronExpression.length > 120) {
      throw new TypeError("A valid Airbyte cron expression is required.")
    }
    await this.authorizedJson<unknown>(
      `${this.config.apiUrl}/connections/${encodeURIComponent(connectionId)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          schedule: { scheduleType: "cron", cronExpression },
        }),
      },
    )
  }

  private async authorizedJson<T>(url: string, init: RequestInit): Promise<T> {
    const perform = async (forceRefresh: boolean) => {
      const token = await this.accessToken(forceRefresh)
      return requestJson<T>(
        url,
        {
          ...init,
          headers: {
            Accept: "application/json",
            ...init.headers,
            Authorization: `Bearer ${token}`,
          },
        },
        {
          tool: "airbyte",
          timeoutMs: this.config.requestTimeoutMs,
          fetchImplementation: this.fetchImplementation,
        },
      )
    }

    try {
      return await perform(false)
    } catch (error) {
      if (
        error instanceof ToolHttpError &&
        error.status === 401 &&
        this.config.auth.type === "client-credentials"
      ) {
        return perform(true)
      }
      throw error
    }
  }

  private async accessToken(forceRefresh: boolean): Promise<string> {
    if (this.config.auth.type === "access-token") return this.config.auth.accessToken
    if (forceRefresh) this.cachedToken = null
    if (
      this.cachedToken &&
      this.cachedToken.expiresAt - TOKEN_EXPIRY_SKEW_MS > Date.now()
    ) {
      return this.cachedToken.value
    }
    if (this.pendingToken) return this.pendingToken

    const request = this.requestAccessToken()
    this.pendingToken = request
    try {
      return await request
    } finally {
      if (this.pendingToken === request) this.pendingToken = null
    }
  }

  private async requestAccessToken(): Promise<string> {
    if (this.config.auth.type !== "client-credentials") {
      return this.config.auth.accessToken
    }
    const response = await requestJson<AirbyteTokenResponse>(
      this.config.auth.tokenUrl,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          client_id: this.config.auth.clientId,
          client_secret: this.config.auth.clientSecret,
          "grant-type": "client_credentials",
        }),
      },
      {
        tool: "airbyte",
        timeoutMs: this.config.requestTimeoutMs,
        fetchImplementation: this.fetchImplementation,
      },
    )
    if (!response.access_token) {
      throw new ToolHttpError("Airbyte returned an invalid access token.", null, "airbyte")
    }
    const expiresInSeconds =
      typeof response.expires_in === "number" && response.expires_in > 0
        ? response.expires_in
        : 180
    this.cachedToken = {
      value: response.access_token,
      expiresAt: Date.now() + expiresInSeconds * 1_000,
    }
    return this.cachedToken.value
  }
}
