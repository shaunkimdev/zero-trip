export type ToolConfiguration<T> =
  | { state: "disabled"; config: null; message: string }
  | { state: "misconfigured"; config: null; message: string }
  | { state: "configured"; config: T; message: string }

export interface RagflowConfig {
  baseUrl: string
  apiKey: string
  datasetIds: readonly string[]
  allowedSourceHosts: readonly string[]
  fallbackToDemo: boolean
  maxSourceAgeDays: number
  pageSize: number
  similarityThreshold: number
  vectorSimilarityWeight: number
  knnTopK: number
  requestTimeoutMs: number
}

export type AirbyteAuth =
  | { type: "access-token"; accessToken: string }
  | {
      type: "client-credentials"
      clientId: string
      clientSecret: string
      tokenUrl: string
    }

export interface AirbyteConfig {
  apiUrl: string
  auth: AirbyteAuth
  mainDbConnectionIds: readonly string[]
  ragflowConnectionIds: readonly string[]
  requestTimeoutMs: number
}

export interface KmaConfig {
  serviceKey: string
  requestTimeoutMs: number
}

export interface KakaoConfig {
  apiKey: string
  requestTimeoutMs: number
}

export interface TourApiConfig {
  serviceKey: string
  requestTimeoutMs: number
}

export interface ZeroTripToolConfig {
  ragflow: ToolConfiguration<RagflowConfig>
  airbyte: ToolConfiguration<AirbyteConfig>
  kma: ToolConfiguration<KmaConfig>
  kakao: ToolConfiguration<KakaoConfig>
  tourApi: ToolConfiguration<TourApiConfig>
  adminToken: string | null
  api: {
    planRateLimitPerMinute: number
    planMaxConcurrency: number
  }
}

type Environment = Readonly<Record<string, string | undefined>>

const RAGFLOW_KEYS = [
  "RAGFLOW_BASE_URL",
  "RAGFLOW_API_KEY",
  "RAGFLOW_DATASET_IDS",
  "RAGFLOW_ALLOWED_SOURCE_HOSTS",
] as const

const AIRBYTE_KEYS = [
  "AIRBYTE_API_URL",
  "AIRBYTE_ACCESS_TOKEN",
  "AIRBYTE_CLIENT_ID",
  "AIRBYTE_CLIENT_SECRET",
  "AIRBYTE_MAIN_DB_CONNECTION_IDS",
  "AIRBYTE_RAGFLOW_CONNECTION_IDS",
] as const

function value(environment: Environment, key: string) {
  const configured = environment[key]?.trim()
  return configured ? configured : undefined
}

function anyConfigured(environment: Environment, keys: readonly string[]) {
  return keys.some((key) => value(environment, key) !== undefined)
}

function csv(input: string | undefined) {
  return [
    ...new Set(
      (input ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ]
}

function httpUrl(input: string, label: string, allowInsecureHttp: boolean) {
  let parsed: URL
  try {
    parsed = new URL(input)
  } catch {
    throw new Error(`${label} must be a valid URL.`)
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`${label} must use http or https.`)
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(`${label} must not contain credentials, a query, or a fragment.`)
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"])
  if (
    parsed.protocol === "http:" &&
    !localHosts.has(parsed.hostname.toLowerCase()) &&
    !allowInsecureHttp
  ) {
    throw new Error(
      `${label} must use HTTPS unless ZERO_TRIP_ALLOW_INSECURE_TOOL_HTTP=true.`,
    )
  }
  return parsed.toString().replace(/\/$/, "")
}

function insecureHttpAllowed(environment: Environment) {
  const configured = value(environment, "ZERO_TRIP_ALLOW_INSECURE_TOOL_HTTP")
  if (configured === undefined || configured === "false") return false
  if (configured === "true") return true
  throw new Error("ZERO_TRIP_ALLOW_INSECURE_TOOL_HTTP must be true or false.")
}

function numberInRange(
  input: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
) {
  if (input === undefined) return fallback
  const parsed = Number(input)
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}.`)
  }
  return parsed
}

function integerInRange(
  input: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
  label: string,
) {
  const parsed = numberInRange(input, fallback, minimum, maximum, label)
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`)
  return parsed
}

function booleanSetting(input: string | undefined, fallback: boolean, label: string) {
  if (input === undefined) return fallback
  if (input === "true") return true
  if (input === "false") return false
  throw new Error(`${label} must be true or false.`)
}

function ragflowConfiguration(environment: Environment): ToolConfiguration<RagflowConfig> {
  if (!anyConfigured(environment, RAGFLOW_KEYS)) {
    return {
      state: "disabled",
      config: null,
      message: "RAGFlow environment variables are not set; the demo catalog remains active.",
    }
  }

  try {
    const allowInsecureHttp = insecureHttpAllowed(environment)
    const baseUrl = value(environment, "RAGFLOW_BASE_URL")
    const apiKey = value(environment, "RAGFLOW_API_KEY")
    const datasetIds = csv(value(environment, "RAGFLOW_DATASET_IDS"))
    const allowedSourceHosts = csv(value(environment, "RAGFLOW_ALLOWED_SOURCE_HOSTS")).map(
      (host) => host.toLowerCase(),
    )
    if (!baseUrl || !apiKey || datasetIds.length === 0 || allowedSourceHosts.length === 0) {
      throw new Error(
        "RAGFLOW_BASE_URL, RAGFLOW_API_KEY, RAGFLOW_DATASET_IDS and RAGFLOW_ALLOWED_SOURCE_HOSTS must be set together.",
      )
    }
    for (const host of allowedSourceHosts) {
      if (
        host.includes("/") ||
        host.includes(":") ||
        new URL(`https://${host}`).hostname.toLowerCase() !== host
      ) {
        throw new Error("RAGFLOW_ALLOWED_SOURCE_HOSTS must contain hostnames only.")
      }
    }

    return {
      state: "configured",
      message: `RAGFlow retrieval is configured for ${datasetIds.length} dataset(s).`,
      config: {
        baseUrl: httpUrl(baseUrl, "RAGFLOW_BASE_URL", allowInsecureHttp),
        apiKey,
        datasetIds,
        allowedSourceHosts,
        fallbackToDemo: booleanSetting(
          value(environment, "RAGFLOW_FALLBACK_TO_DEMO"),
          false,
          "RAGFLOW_FALLBACK_TO_DEMO",
        ),
        maxSourceAgeDays: integerInRange(
          value(environment, "RAGFLOW_MAX_SOURCE_AGE_DAYS"),
          30,
          1,
          3_650,
          "RAGFLOW_MAX_SOURCE_AGE_DAYS",
        ),
        pageSize: integerInRange(
          value(environment, "RAGFLOW_PAGE_SIZE"),
          30,
          1,
          100,
          "RAGFLOW_PAGE_SIZE",
        ),
        similarityThreshold: numberInRange(
          value(environment, "RAGFLOW_SIMILARITY_THRESHOLD"),
          0.2,
          0,
          1,
          "RAGFLOW_SIMILARITY_THRESHOLD",
        ),
        vectorSimilarityWeight: numberInRange(
          value(environment, "RAGFLOW_VECTOR_SIMILARITY_WEIGHT"),
          0.3,
          0,
          1,
          "RAGFLOW_VECTOR_SIMILARITY_WEIGHT",
        ),
        knnTopK: integerInRange(
          value(environment, "RAGFLOW_KNN_TOP_K"),
          1_024,
          1,
          10_000,
          "RAGFLOW_KNN_TOP_K",
        ),
        requestTimeoutMs: integerInRange(
          value(environment, "RAGFLOW_REQUEST_TIMEOUT_MS"),
          10_000,
          1_000,
          60_000,
          "RAGFLOW_REQUEST_TIMEOUT_MS",
        ),
      },
    }
  } catch (error) {
    return {
      state: "misconfigured",
      config: null,
      message: error instanceof Error ? error.message : "RAGFlow configuration is invalid.",
    }
  }
}

function airbyteConfiguration(environment: Environment): ToolConfiguration<AirbyteConfig> {
  if (!anyConfigured(environment, AIRBYTE_KEYS)) {
    return {
      state: "disabled",
      config: null,
      message: "Airbyte environment variables are not set.",
    }
  }

  try {
    const allowInsecureHttp = insecureHttpAllowed(environment)
    const apiUrl = httpUrl(
      value(environment, "AIRBYTE_API_URL") ?? "https://api.airbyte.com/v1",
      "AIRBYTE_API_URL",
      allowInsecureHttp,
    )
    const accessToken = value(environment, "AIRBYTE_ACCESS_TOKEN")
    const clientId = value(environment, "AIRBYTE_CLIENT_ID")
    const clientSecret = value(environment, "AIRBYTE_CLIENT_SECRET")
    let auth: AirbyteAuth

    if (accessToken) {
      auth = { type: "access-token", accessToken }
    } else if (clientId && clientSecret) {
      auth = {
        type: "client-credentials",
        clientId,
        clientSecret,
        tokenUrl: httpUrl(
          value(environment, "AIRBYTE_TOKEN_URL") ?? `${apiUrl}/applications/token`,
          "AIRBYTE_TOKEN_URL",
          allowInsecureHttp,
        ),
      }
    } else {
      throw new Error(
        "Set AIRBYTE_ACCESS_TOKEN or both AIRBYTE_CLIENT_ID and AIRBYTE_CLIENT_SECRET.",
      )
    }

    const mainDbConnectionIds = csv(value(environment, "AIRBYTE_MAIN_DB_CONNECTION_IDS"))
    const ragflowConnectionIds = csv(value(environment, "AIRBYTE_RAGFLOW_CONNECTION_IDS"))
    if (mainDbConnectionIds.length + ragflowConnectionIds.length === 0) {
      throw new Error(
        "At least one AIRBYTE_MAIN_DB_CONNECTION_IDS or AIRBYTE_RAGFLOW_CONNECTION_IDS value is required.",
      )
    }
    const overlappingConnection = mainDbConnectionIds.find((id) =>
      ragflowConnectionIds.includes(id),
    )
    if (overlappingConnection) {
      throw new Error(
        "An Airbyte connection ID cannot belong to both the main DB and RAGFlow groups.",
      )
    }
    if (mainDbConnectionIds.length > 20 || ragflowConnectionIds.length > 20) {
      throw new Error("Each Airbyte connection group may contain at most 20 IDs.")
    }

    return {
      state: "configured",
      message: `Airbyte is configured with ${mainDbConnectionIds.length} main DB and ${ragflowConnectionIds.length} RAG pipeline connection(s).`,
      config: {
        apiUrl,
        auth,
        mainDbConnectionIds,
        ragflowConnectionIds,
        requestTimeoutMs: integerInRange(
          value(environment, "AIRBYTE_REQUEST_TIMEOUT_MS"),
          15_000,
          1_000,
          60_000,
          "AIRBYTE_REQUEST_TIMEOUT_MS",
        ),
      },
    }
  } catch (error) {
    return {
      state: "misconfigured",
      config: null,
      message: error instanceof Error ? error.message : "Airbyte configuration is invalid.",
    }
  }
}

function optionalApiConfiguration<T>(
  environment: Environment,
  environmentKey: string,
  label: string,
  createConfig: (secret: string, requestTimeoutMs: number) => T,
): ToolConfiguration<T> {
  const secret = value(environment, environmentKey)
  if (!secret) {
    return {
      state: "disabled",
      config: null,
      message: `${label} environment variable is not set.`,
    }
  }

  try {
    const requestTimeoutMs = integerInRange(
      value(environment, "ZERO_TRIP_LIVE_API_TIMEOUT_MS"),
      8_000,
      1_000,
      30_000,
      "ZERO_TRIP_LIVE_API_TIMEOUT_MS",
    )
    return {
      state: "configured",
      config: createConfig(secret, requestTimeoutMs),
      message: `${label} is configured.`,
    }
  } catch (error) {
    return {
      state: "misconfigured",
      config: null,
      message: error instanceof Error ? error.message : `${label} configuration is invalid.`,
    }
  }
}

export function loadToolConfig(environment: Environment): ZeroTripToolConfig {
  const configuredAdminToken = value(environment, "ZERO_TRIP_TOOLS_ADMIN_TOKEN")
  if (configuredAdminToken && configuredAdminToken.length < 24) {
    throw new Error("ZERO_TRIP_TOOLS_ADMIN_TOKEN must contain at least 24 characters.")
  }
  return {
    ragflow: ragflowConfiguration(environment),
    airbyte: airbyteConfiguration(environment),
    kma: optionalApiConfiguration(
      environment,
      "KMA_SERVICE_KEY",
      "KMA forecast API",
      (serviceKey, requestTimeoutMs) => ({ serviceKey, requestTimeoutMs }),
    ),
    kakao: optionalApiConfiguration(
      environment,
      "KAKAO_REST_API_KEY",
      "Kakao Local and routing API",
      (apiKey, requestTimeoutMs) => ({ apiKey, requestTimeoutMs }),
    ),
    tourApi: optionalApiConfiguration(
      environment,
      "TOUR_API_SERVICE_KEY",
      "Korea Tourism Organization TourAPI",
      (serviceKey, requestTimeoutMs) => ({ serviceKey, requestTimeoutMs }),
    ),
    adminToken: configuredAdminToken ?? null,
    api: {
      planRateLimitPerMinute: integerInRange(
        value(environment, "ZERO_TRIP_PLAN_RATE_LIMIT_PER_MINUTE"),
        20,
        1,
        10_000,
        "ZERO_TRIP_PLAN_RATE_LIMIT_PER_MINUTE",
      ),
      planMaxConcurrency: integerInRange(
        value(environment, "ZERO_TRIP_PLAN_MAX_CONCURRENCY"),
        8,
        1,
        1_000,
        "ZERO_TRIP_PLAN_MAX_CONCURRENCY",
      ),
    },
  }
}
