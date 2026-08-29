import { seoulPlaces } from "../../src/data/seoul-places.ts"
import { planTrip } from "../../src/lib/planner.ts"
import {
  INTEREST_LABELS,
  type TripPlan,
  type TripRequest,
} from "../../src/types/trip.ts"
import { AirbyteService, type AirbyteSyncTarget } from "./airbyte/service.ts"
import { RagflowClient } from "./ragflow/client.ts"
import { adaptRagflowPlaceChunks } from "./ragflow/place-adapter.ts"
import type {
  ToolConfiguration,
  ZeroTripToolConfig,
} from "./shared/config.ts"

export class ToolManagerError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly statusCode: number,
  ) {
    super(message)
    this.name = "ToolManagerError"
  }
}

function configurationStatus<T>(configuration: ToolConfiguration<T>) {
  return {
    state: configuration.state,
    message: configuration.message,
  }
}

function retrievalQuestion(request: TripRequest) {
  const wants = request.wants.map((interest) => INTEREST_LABELS[interest]).join(", ") || "제한 없음"
  const avoids = request.avoids.join(", ") || "없음"
  return [
    "서울 관광 코스에 넣을 수 있는 검증된 장소 레코드를 검색합니다.",
    `방문일: ${typeof request.date === "string" ? request.date : request.date.toISOString()}`,
    `이용 시간: ${request.startTime}-${request.endTime}`,
    `일정 예산 상한: ${Math.floor(request.budgetWon).toLocaleString("ko-KR")}원`,
    `동행: ${request.companion}, 선호: ${wants}, 제외 조건: ${avoids}`,
    `출발 좌표: ${request.origin.lat.toFixed(5)}, ${request.origin.lng.toFixed(5)}`,
    "입장료 또는 가격대, 요일별 운영시간, 좌표, 출처와 갱신일이 모두 있는 canonical JSON 장소만 반환합니다.",
  ].join("\n")
}

function demoPlan(request: TripRequest): TripPlan {
  const plan = planTrip(request, seoulPlaces)
  return {
    ...plan,
    grounding: {
      mode: "demo",
      provider: "ZERO TRIP 서울 데모 카탈로그",
      retrievedAt: new Date().toISOString(),
      retrievedChunkCount: 0,
      acceptedPlaceCount: seoulPlaces.length,
      rejectedChunkCount: 0,
    },
  }
}

function sourceIsAllowed(
  sourceUrl: string | undefined,
  updatedAt: string,
  allowedHosts: readonly string[],
  maxAgeDays: number,
) {
  if (!sourceUrl) return false
  const hostname = new URL(sourceUrl).hostname.toLowerCase()
  if (!allowedHosts.some((host) => hostname === host || hostname.endsWith(`.${host}`))) {
    return false
  }
  const updatedTime = Date.parse(updatedAt)
  const now = Date.now()
  return (
    Number.isFinite(updatedTime) &&
    updatedTime <= now + 24 * 60 * 60 * 1_000 &&
    now - updatedTime <= maxAgeDays * 24 * 60 * 60 * 1_000
  )
}

export class ZeroTripToolManager {
  private readonly ragflowClient: RagflowClient | null
  private readonly airbyteService: AirbyteService | null

  constructor(private readonly config: ZeroTripToolConfig) {
    this.ragflowClient =
      config.ragflow.state === "configured"
        ? new RagflowClient(config.ragflow.config)
        : null
    this.airbyteService =
      config.airbyte.state === "configured"
        ? new AirbyteService(config.airbyte.config)
        : null
  }

  status() {
    const airbyteCounts = this.airbyteService?.counts() ?? { mainDb: 0, ragflow: 0 }
    return {
      ragflow: {
        ...configurationStatus(this.config.ragflow),
        apiContract: "v0.27.1",
        datasetCount:
          this.config.ragflow.state === "configured"
            ? this.config.ragflow.config.datasetIds.length
            : 0,
      },
      airbyte: {
        ...configurationStatus(this.config.airbyte),
        mainDbConnectionCount: airbyteCounts.mainDb,
        ragflowConnectionCount: airbyteCounts.ragflow,
      },
      adminApi: { configured: this.config.adminToken !== null },
    }
  }

  async planTrip(request: TripRequest): Promise<TripPlan> {
    if (this.config.ragflow.state === "disabled") return demoPlan(request)
    if (this.config.ragflow.state === "misconfigured" || !this.ragflowClient) {
      throw new ToolManagerError(
        "RAGFlow 설정이 완전하지 않아 근거 기반 추천을 만들 수 없어요.",
        "RAGFLOW_MISCONFIGURED",
        503,
      )
    }
    const ragflowConfig = this.config.ragflow.config

    let retrieval
    try {
      retrieval = await this.ragflowClient.retrieve(retrievalQuestion(request))
    } catch {
      throw new ToolManagerError(
        "RAGFlow 근거 데이터를 조회하지 못했어요. 잠시 후 다시 시도해 주세요.",
        "RAGFLOW_UNAVAILABLE",
        502,
      )
    }

    const adapted = adaptRagflowPlaceChunks(retrieval.chunks)
    const configuredDatasetIds = new Set(ragflowConfig.datasetIds)
    const policyAccepted = adapted.accepted.filter(
      (evidence) =>
        evidence.datasetId !== undefined &&
        configuredDatasetIds.has(evidence.datasetId) &&
        sourceIsAllowed(
          evidence.place.source.url,
          evidence.place.source.updatedAt,
          ragflowConfig.allowedSourceHosts,
          ragflowConfig.maxSourceAgeDays,
        ),
    )
    const policyRejectedCount = adapted.accepted.length - policyAccepted.length
    const rejectedCount = adapted.rejectedCount + policyRejectedCount
    const places = policyAccepted.map((evidence) => evidence.place)
    const planned = planTrip(request, places)
    const groundingWarnings: string[] = []
    if (places.length === 0) {
      groundingWarnings.push(
        "RAGFlow에서 형식과 출처가 검증된 장소를 찾지 못해 임의 장소를 추천하지 않았어요.",
      )
    }
    if (rejectedCount > 0) {
      groundingWarnings.push(
        `검색 결과 중 ${rejectedCount}건은 필수 가격·운영시간·허용 데이터셋·출처·최신성 검증을 통과하지 못해 제외했어요.`,
      )
    }

    return {
      ...planned,
      warnings: [...groundingWarnings, ...planned.warnings],
      grounding: {
        mode: "ragflow",
        provider: "RAGFlow",
        retrievedAt: new Date().toISOString(),
        retrievedChunkCount: retrieval.chunks.length,
        acceptedPlaceCount: places.length,
        rejectedChunkCount: rejectedCount,
      },
    }
  }

  async triggerAirbyte(target: AirbyteSyncTarget, connectionId?: string) {
    return this.airbyte().trigger(target, connectionId)
  }

  async getAirbyteJob(jobId: string) {
    return this.airbyte().getJob(jobId)
  }

  private airbyte() {
    if (this.config.airbyte.state !== "configured" || !this.airbyteService) {
      throw new ToolManagerError(
        "Airbyte가 설정되지 않아 동기화를 관리할 수 없습니다.",
        this.config.airbyte.state === "misconfigured"
          ? "AIRBYTE_MISCONFIGURED"
          : "AIRBYTE_DISABLED",
        503,
      )
    }
    return this.airbyteService
  }
}
