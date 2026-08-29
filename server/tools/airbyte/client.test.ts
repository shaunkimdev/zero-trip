import { describe, expect, it, vi } from "vitest"

import type { AirbyteConfig } from "../shared/config.ts"
import { ToolHttpError, type Fetch } from "../shared/http-client.ts"
import { AirbyteClient } from "./client.ts"

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function accessTokenConfig(accessToken = "static-airbyte-token"): AirbyteConfig {
  return {
    apiUrl: "https://airbyte.example.test/v1",
    auth: { type: "access-token", accessToken },
    mainDbConnectionIds: ["main-db-connection"],
    ragflowConnectionIds: [],
    requestTimeoutMs: 5_000,
  }
}

function clientCredentialsConfig(): AirbyteConfig {
  return {
    apiUrl: "https://airbyte.example.test/v1",
    auth: {
      type: "client-credentials",
      clientId: "zero-trip-client",
      clientSecret: "zero-trip-client-secret",
      tokenUrl: "https://airbyte.example.test/v1/applications/token",
    },
    mainDbConnectionIds: ["main-db-connection"],
    ragflowConnectionIds: [],
    requestTimeoutMs: 5_000,
  }
}

describe("AirbyteClient", () => {
  it("triggers a sync with a static Bearer token and normalizes the job response", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        jobId: 42,
        status: "queued",
        jobType: "sync",
        connectionId: "main-db-connection",
        startTime: "2026-08-29T00:00:00Z",
        lastUpdatedAt: "2026-08-29T00:00:01Z",
        bytesSynced: 1_024,
        rowsSynced: 12,
      }),
    ) as unknown as Fetch
    const client = new AirbyteClient(accessTokenConfig(), fetchMock)

    await expect(client.triggerSync("main-db-connection")).resolves.toEqual({
      jobId: "42",
      status: "queued",
      jobType: "sync",
      connectionId: "main-db-connection",
      startTime: "2026-08-29T00:00:00Z",
      lastUpdatedAt: "2026-08-29T00:00:01Z",
      bytesSynced: 1_024,
      rowsSynced: 12,
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://airbyte.example.test/v1/jobs")
    expect(init).toMatchObject({ method: "POST" })
    expect(init?.headers).toMatchObject({
      Accept: "application/json",
      Authorization: "Bearer static-airbyte-token",
      "Content-Type": "application/json",
    })
    expect(JSON.parse(String(init?.body))).toEqual({
      connectionId: "main-db-connection",
      jobType: "sync",
    })
  })

  it("caches a client-credential token and sends the exact grant-type field", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith("/applications/token")) {
        return jsonResponse({ access_token: "cached-token", expires_in: 900 })
      }
      return jsonResponse({ jobId: 7, status: "running", jobType: "sync" })
    }) as unknown as Fetch
    const client = new AirbyteClient(clientCredentialsConfig(), fetchMock)

    await client.triggerSync("main-db-connection")
    await client.triggerSync("main-db-connection")

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const tokenCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).endsWith("/applications/token"),
    )
    const jobCalls = fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/jobs"))
    expect(tokenCalls).toHaveLength(1)
    expect(jobCalls).toHaveLength(2)

    const tokenBody = JSON.parse(String(tokenCalls[0][1]?.body)) as Record<string, unknown>
    expect(tokenBody).toEqual({
      client_id: "zero-trip-client",
      client_secret: "zero-trip-client-secret",
      "grant-type": "client_credentials",
    })
    expect(tokenBody).not.toHaveProperty("grant_type")
    for (const [, init] of jobCalls) {
      expect(init?.headers).toMatchObject({ Authorization: "Bearer cached-token" })
    }
  })

  it("forces one token refresh and retries the request once after a 401", async () => {
    let tokenRequests = 0
    let jobRequests = 0
    const jobAuthorizations: string[] = []
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith("/applications/token")) {
        tokenRequests += 1
        return jsonResponse({
          access_token: tokenRequests === 1 ? "expired-token" : "refreshed-token",
          expires_in: 900,
        })
      }

      jobRequests += 1
      jobAuthorizations.push(
        String((init?.headers as Record<string, string> | undefined)?.Authorization),
      )
      if (jobRequests === 1) return jsonResponse({ title: "invalid-access-token" }, 401)
      return jsonResponse({ jobId: 99, status: "succeeded", jobType: "sync" })
    }) as unknown as Fetch
    const client = new AirbyteClient(clientCredentialsConfig(), fetchMock)

    await expect(client.triggerSync("main-db-connection")).resolves.toMatchObject({
      jobId: "99",
      status: "succeeded",
    })
    expect(tokenRequests).toBe(2)
    expect(jobRequests).toBe(2)
    expect(jobAuthorizations).toEqual([
      "Bearer expired-token",
      "Bearer refreshed-token",
    ])
    expect(fetchMock).toHaveBeenCalledTimes(4)
  })

  it("rejects an invalid Airbyte job response", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ jobId: 12, status: "unknown-status", jobType: "sync" }),
    ) as unknown as Fetch
    const client = new AirbyteClient(accessTokenConfig(), fetchMock)

    const request = client.triggerSync("main-db-connection")
    await expect(request).rejects.toBeInstanceOf(ToolHttpError)
    await expect(request).rejects.toMatchObject({
      message: "Airbyte returned an invalid job response.",
      status: null,
      tool: "airbyte",
    })
  })
})
