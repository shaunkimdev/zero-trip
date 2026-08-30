import { describe, expect, it } from "vitest"

import { ZeroTripToolManager } from "../tool-manager.ts"
import { loadToolConfig } from "./config.ts"

describe("tool configuration", () => {
  it("keeps all integrations disabled when their environment variables are absent", () => {
    const config = loadToolConfig({
      RAGFLOW_BASE_URL: "  ",
      RAGFLOW_ALLOWED_SOURCE_HOSTS: "",
      RAGFLOW_MAX_SOURCE_AGE_DAYS: "30",
      AIRBYTE_ACCESS_TOKEN: "",
      AIRBYTE_REQUEST_TIMEOUT_MS: "15000",
      ZERO_TRIP_TOOLS_ADMIN_TOKEN: " ",
    })

    expect(config.ragflow).toEqual({
      state: "disabled",
      config: null,
      message: "RAGFlow environment variables are not set; the demo catalog remains active.",
    })
    expect(config.airbyte).toEqual({
      state: "disabled",
      config: null,
      message: "Airbyte environment variables are not set.",
    })
    expect(config.kma.state).toBe("disabled")
    expect(config.kakao.state).toBe("disabled")
    expect(config.tourApi.state).toBe("disabled")
    expect(config.adminToken).toBeNull()
  })

  it("reports partial tool settings as misconfigured without echoing secret values", () => {
    const ragflowSecret = "ragflow-secret-that-must-not-leak"
    const airbyteSecret = "airbyte-secret-that-must-not-leak"
    const config = loadToolConfig({
      RAGFLOW_API_KEY: ragflowSecret,
      AIRBYTE_ACCESS_TOKEN: airbyteSecret,
    })

    expect(config.ragflow.state).toBe("misconfigured")
    expect(config.airbyte.state).toBe("misconfigured")
    expect(config.ragflow.config).toBeNull()
    expect(config.airbyte.config).toBeNull()

    const messages = `${config.ragflow.message}\n${config.airbyte.message}`
    expect(messages).toContain("must be set together")
    expect(messages).toContain("At least one AIRBYTE_MAIN_DB_CONNECTION_IDS")
    expect(messages).not.toContain(ragflowSecret)
    expect(messages).not.toContain(airbyteSecret)
  })

  it("normalizes configured values, deduplicates CSV lists, and redacts public status", () => {
    const secrets = {
      ragflow: "ragflow-api-key-private",
      airbyte: "airbyte-client-secret-private",
      admin: "zero-trip-admin-token-private",
      kma: "kma-private-key",
      kakao: "kakao-private-key",
      tourApi: "tour-api-private-key",
    }
    const config = loadToolConfig({
      RAGFLOW_BASE_URL: "https://ragflow.example.test/",
      RAGFLOW_API_KEY: secrets.ragflow,
      RAGFLOW_DATASET_IDS: " dataset-a, dataset-b, dataset-a, ,dataset-b ",
      RAGFLOW_ALLOWED_SOURCE_HOSTS: "data.seoul.go.kr, data.seoul.go.kr",
      RAGFLOW_FALLBACK_TO_DEMO: "true",
      AIRBYTE_API_URL: "https://airbyte.example.test/api/public/v1/",
      AIRBYTE_CLIENT_ID: "zero-trip-client",
      AIRBYTE_CLIENT_SECRET: secrets.airbyte,
      AIRBYTE_MAIN_DB_CONNECTION_IDS: " main-1,main-2, main-1, ,main-2 ",
      AIRBYTE_RAGFLOW_CONNECTION_IDS: " rag-1, rag-1 ",
      ZERO_TRIP_TOOLS_ADMIN_TOKEN: secrets.admin,
      KMA_SERVICE_KEY: secrets.kma,
      KAKAO_REST_API_KEY: secrets.kakao,
      TOUR_API_SERVICE_KEY: secrets.tourApi,
    })

    expect(config.ragflow.state).toBe("configured")
    expect(config.airbyte.state).toBe("configured")
    if (config.ragflow.state !== "configured" || config.airbyte.state !== "configured") return

    expect(config.ragflow.config.baseUrl).toBe("https://ragflow.example.test")
    expect(config.ragflow.config.datasetIds).toEqual(["dataset-a", "dataset-b"])
    expect(config.ragflow.config.fallbackToDemo).toBe(true)
    expect(config.airbyte.config.apiUrl).toBe(
      "https://airbyte.example.test/api/public/v1",
    )
    expect(config.airbyte.config.mainDbConnectionIds).toEqual(["main-1", "main-2"])
    expect(config.airbyte.config.ragflowConnectionIds).toEqual(["rag-1"])
    expect(config.airbyte.config.auth).toMatchObject({
      type: "client-credentials",
      tokenUrl: "https://airbyte.example.test/api/public/v1/applications/token",
    })

    const publicStatus = new ZeroTripToolManager(config).status()
    expect(publicStatus).toMatchObject({
      ragflow: { state: "configured", datasetCount: 2 },
      airbyte: {
        state: "configured",
        mainDbConnectionCount: 2,
        ragflowConnectionCount: 1,
      },
      adminApi: { configured: true },
      kma: { state: "configured" },
      kakao: { state: "configured" },
      tourApi: { state: "configured" },
    })

    const serializedStatus = JSON.stringify(publicStatus)
    for (const secret of Object.values(secrets)) {
      expect(config.ragflow.message).not.toContain(secret)
      expect(config.airbyte.message).not.toContain(secret)
      expect(serializedStatus).not.toContain(secret)
    }
    expect(serializedStatus).not.toContain("main-1")
    expect(serializedStatus).not.toContain("rag-1")
  })
})
