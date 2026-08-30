import { seoulPlaces } from "../../src/data/seoul-places.ts"
import {
  haversineMeters,
  planTrip,
  retimeTripPlanWithWalkingLegs,
} from "../../src/lib/planner.ts"
import {
  INTEREST_LABELS,
  type Place,
  type TripGrounding,
  type TripIntegrationReport,
  type TripPlan,
  type TripRequest,
} from "../../src/types/trip.ts"
import { AirbyteService, type AirbyteSyncTarget } from "./airbyte/service.ts"
import { KakaoClient, type KakaoPlace } from "./kakao/client.ts"
import { KmaClient, summarizeKmaForecast } from "./kma/client.ts"
import { RagflowClient } from "./ragflow/client.ts"
import { adaptRagflowPlaceChunks } from "./ragflow/place-adapter.ts"
import type {
  ToolConfiguration,
  ZeroTripToolConfig,
} from "./shared/config.ts"
import type { Fetch } from "./shared/http-client.ts"
import { TourApiClient, type TourApiPlace } from "./tour-api/client.ts"

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
  const transport =
    request.transportMode === "walk"
      ? "도보"
      : request.transportMode === "transit"
        ? "대중교통(지하철·버스)"
        : "차량"
  return [
    "서울 관광 코스에 넣을 수 있는 검증된 장소 레코드를 검색합니다.",
    `방문일: ${typeof request.date === "string" ? request.date : request.date.toISOString()}`,
    `이용 시간: ${request.startTime}-${request.endTime}`,
    `일정 예산 상한: ${Math.floor(request.budgetWon).toLocaleString("ko-KR")}원`,
    `주요 이동수단: ${transport}`,
    `동행: ${request.companion}, 선호: ${wants}, 제외 조건: ${avoids}`,
    `출발 좌표: ${request.origin.lat.toFixed(5)}, ${request.origin.lng.toFixed(5)}`,
    "입장료 또는 가격대, 요일별 운영시간, 좌표, 출처와 갱신일이 모두 있는 canonical JSON 장소만 반환합니다.",
  ].join("\n")
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

interface CatalogResult {
  places: readonly Place[]
  grounding: TripGrounding
  warnings: readonly string[]
}

function demoCatalog(retrievedAt: string, warnings: readonly string[] = []): CatalogResult {
  return {
    places: seoulPlaces,
    warnings,
    grounding: {
      mode: "demo",
      provider: "ZERO TRIP 서울 데모 카탈로그",
      retrievedAt,
      retrievedChunkCount: 0,
      acceptedPlaceCount: seoulPlaces.length,
      rejectedChunkCount: 0,
    },
  }
}

interface ToolManagerDependencies {
  fetchImplementation?: Fetch
  now?: () => Date
}

const TOUR_MATCH_MAX_METERS = 500
const TOUR_IMAGE_MATCH_MAX_METERS = 700
const KAKAO_MATCH_MAX_METERS = 500

function normalizedPlaceName(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\[[^\]]*]|\([^)]*\)/g, "")
    .replace(/[^0-9a-z가-힣]/gi, "")
    .toLowerCase()
}

function namesMatch(left: string, right: string) {
  const normalizedLeft = normalizedPlaceName(left)
  const normalizedRight = normalizedPlaceName(right)
  return (
    normalizedLeft === normalizedRight ||
    (Math.min(normalizedLeft.length, normalizedRight.length) >= 5 &&
      (normalizedLeft.includes(normalizedRight) || normalizedRight.includes(normalizedLeft)))
  )
}

const TOUR_CONTENT_TYPES_BY_CATEGORY: Readonly<
  Record<Place["category"], readonly string[]>
> = {
  museum: ["14"],
  exhibition: ["14"],
  event: ["15", "14"],
  performance: ["15", "14"],
  park: ["12", "28"],
  walk: ["12", "28"],
  "night-view": ["12", "28"],
  rest: ["14", "12"],
  cafe: ["39"],
  restaurant: ["39"],
  landmark: ["12", "14"],
}

function tourTitleMatches(place: Place, record: TourApiPlace) {
  return normalizedPlaceName(place.name) === normalizedPlaceName(record.title)
}

function tourContentTypeMatches(place: Place, record: TourApiPlace) {
  return Boolean(
    record.contentTypeId &&
      TOUR_CONTENT_TYPES_BY_CATEGORY[place.category].includes(record.contentTypeId),
  )
}

function confidentTourMatch(
  place: Place,
  record: TourApiPlace,
  maximumDistanceMeters: number,
) {
  return (
    tourTitleMatches(place, record) &&
    tourContentTypeMatches(place, record) &&
    haversineMeters(place.location, record.location) <= maximumDistanceMeters
  )
}

function closestTourMatch(place: Place, records: readonly TourApiPlace[]) {
  return records
    .filter(
      (record) =>
        confidentTourMatch(place, record, TOUR_MATCH_MAX_METERS),
    )
    .sort(
      (left, right) =>
        haversineMeters(place.location, left.location) -
        haversineMeters(place.location, right.location),
    )[0]
}

function closestTourImageMatch(place: Place, records: readonly TourApiPlace[]) {
  return records
    .filter((record) =>
      confidentTourMatch(place, record, TOUR_IMAGE_MATCH_MAX_METERS),
    )
    .sort(
      (left, right) =>
        haversineMeters(place.location, left.location) -
        haversineMeters(place.location, right.location),
    )[0]
}

function enrichPlacesWithTourApi(
  places: readonly Place[],
  records: readonly TourApiPlace[],
  matchedAt: string,
) {
  let matchedPlaceCount = 0
  const enriched = places.map((place) => {
    const match = closestTourMatch(place, records)
    if (!match) return place
    matchedPlaceCount += 1
    return {
      ...place,
      location: match.location,
      address: match.address === "주소 정보 없음" ? place.address : match.address,
      externalReferences: {
        ...place.externalReferences,
        tourApi: {
          contentId: match.contentId,
          matchedAt,
          ...(match.modifiedAt ? { modifiedAt: match.modifiedAt } : {}),
        },
      },
    }
  })
  return { places: enriched, matchedPlaceCount }
}

function closestKakaoMatch(place: Place, records: readonly KakaoPlace[]) {
  return records
    .filter(
      (record) =>
        namesMatch(place.name, record.name) &&
        haversineMeters(place.location, record.location) <= KAKAO_MATCH_MAX_METERS,
    )
    .sort(
      (left, right) =>
        haversineMeters(place.location, left.location) -
        haversineMeters(place.location, right.location),
    )[0]
}

function dateKey(request: TripRequest) {
  if (typeof request.date === "string") return request.date.slice(0, 10)
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(request.date)
}

function uniqueWarnings(warnings: readonly string[]) {
  return [...new Set(warnings)]
}

export class ZeroTripToolManager {
  private readonly ragflowClient: RagflowClient | null
  private readonly airbyteService: AirbyteService | null
  private readonly kmaClient: KmaClient | null
  private readonly kakaoClient: KakaoClient | null
  private readonly tourApiClient: TourApiClient | null
  private readonly now: () => Date

  constructor(
    private readonly config: ZeroTripToolConfig,
    dependencies: ToolManagerDependencies = {},
  ) {
    const fetchImplementation = dependencies.fetchImplementation
    const now = dependencies.now ?? (() => new Date())
    this.now = now
    this.ragflowClient =
      config.ragflow.state === "configured"
        ? new RagflowClient(config.ragflow.config, fetchImplementation)
        : null
    this.airbyteService =
      config.airbyte.state === "configured"
        ? new AirbyteService(config.airbyte.config)
        : null
    this.kmaClient =
      config.kma.state === "configured"
        ? new KmaClient(config.kma.config, fetchImplementation, now)
        : null
    this.kakaoClient =
      config.kakao.state === "configured"
        ? new KakaoClient(config.kakao.config, fetchImplementation)
        : null
    this.tourApiClient =
      config.tourApi.state === "configured"
        ? new TourApiClient(
            config.tourApi.config,
            fetchImplementation,
            () => now().getTime(),
          )
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
      kma: configurationStatus(this.config.kma),
      kakao: configurationStatus(this.config.kakao),
      tourApi: configurationStatus(this.config.tourApi),
      adminApi: { configured: this.config.adminToken !== null },
    }
  }

  async planTrip(request: TripRequest): Promise<TripPlan> {
    const nearbyRadiusMeters =
      request.transportMode === "walk"
        ? Math.min(20_000, Math.max(3_000, request.maxWalkingKm * 1_000 + 2_000))
        : 20_000
    const catalogPromise = this.retrieveCatalog(request)
    const weatherPromise = this.kmaClient
      ? this.kmaClient
          .forecast({
            location: request.origin,
            date: dateKey(request),
            startTime: request.startTime,
            endTime: request.endTime,
          })
          .then((value) => ({ ok: true as const, value }))
          .catch(() => ({ ok: false as const }))
      : Promise.resolve(null)
    const tourPromise = this.tourApiClient
      ? this.tourApiClient
          .nearbyPlaces(
            request.origin,
            nearbyRadiusMeters,
          )
          .then((value) => ({ ok: true as const, value }))
          .catch(() => ({ ok: false as const }))
      : Promise.resolve(null)
    const [catalog, weatherResult, tourResult] = await Promise.all([
      catalogPromise,
      weatherPromise,
      tourPromise,
    ])
    const integrations: TripIntegrationReport = {}
    const integrationWarnings: string[] = []
    let candidatePlaces = catalog.places

    if (this.kmaClient) {
      if (!weatherResult?.ok) {
        integrations.kma = {
          state: "unavailable",
          forecastPointCount: 0,
          outdoorPlacesExcluded: 0,
        }
        integrationWarnings.push(
          "기상청 예보를 불러오지 못해 날씨 제약 없이 코스를 만들었어요.",
        )
      } else if (weatherResult.value.points.length === 0) {
        integrations.kma = {
          state: "skipped",
          forecastPointCount: 0,
          outdoorPlacesExcluded: 0,
          issuedAt: weatherResult.value.issuedAt,
        }
        integrationWarnings.push(
          "선택한 일정은 기상청 예보 범위 밖이라 날씨 제약을 적용하지 않았어요.",
        )
      } else {
        const summary = summarizeKmaForecast(weatherResult.value)
        const before = candidatePlaces.length
        if (summary.outdoorRisk) {
          candidatePlaces = candidatePlaces.filter(
            (place) =>
              !(
                place.avoidFlags.includes("outdoors") ||
                place.tags.includes("outdoor")
              ),
          )
        }
        const outdoorPlacesExcluded = before - candidatePlaces.length
        integrations.kma = {
          state: "applied",
          forecastPointCount: weatherResult.value.points.length,
          outdoorPlacesExcluded,
          issuedAt: weatherResult.value.issuedAt,
        }
        if (summary.outdoorRisk) {
          const risks = [
            summary.heavyPrecipitation ? "많은 비" : null,
            summary.strongWind ? "강풍" : null,
            summary.lightning ? "낙뢰" : null,
            summary.extremeTemperature ? "극한 기온" : null,
          ].filter(Boolean)
          integrationWarnings.push(
            `기상청 예보의 ${risks.join("·")}을 반영해 야외 후보 ${outdoorPlacesExcluded}곳을 제외했어요.`,
          )
        } else if (summary.precipitation) {
          integrationWarnings.push(
            "기상청 예보에 비·눈 가능성이 있어 야외 투어는 유지하되 우산과 노면 상태를 확인해 주세요.",
          )
        }
      }
    }

    if (this.tourApiClient) {
      if (!tourResult?.ok) {
        integrations.tourApi = {
          state: "unavailable",
          resultCount: 0,
          matchedPlaceCount: 0,
        }
        integrationWarnings.push(
          "한국관광공사 TourAPI를 불러오지 못해 기존 장소 좌표와 주소를 사용했어요.",
        )
      } else {
        const enriched = enrichPlacesWithTourApi(
          candidatePlaces,
          tourResult.value,
          this.now().toISOString(),
        )
        candidatePlaces = enriched.places
        integrations.tourApi = {
          state: enriched.matchedPlaceCount > 0 ? "applied" : "skipped",
          resultCount: tourResult.value.length,
          matchedPlaceCount: enriched.matchedPlaceCount,
        }
      }
    }

    const externalWarnings = uniqueWarnings([
      ...catalog.warnings,
      ...integrationWarnings,
    ])
    let planned = planTrip(request, candidatePlaces)
    planned = {
      ...planned,
      grounding: catalog.grounding,
      integrations,
      warnings: uniqueWarnings([
        ...externalWarnings,
        ...planned.warnings,
      ]),
    }

    let finalized: TripPlan
    if (!this.kakaoClient || planned.stops.length === 0) {
      if (this.kakaoClient) {
        integrations.kakao = {
          state: "skipped",
          matchedPlaceCount: 0,
          routeApplied: false,
        }
      }
      finalized = { ...planned, integrations }
    } else {
      finalized = await this.applyKakao(
        request,
        planned,
        integrations,
        candidatePlaces,
        externalWarnings,
      )
    }

    return this.applyTourImages(finalized)
  }

  private async retrieveCatalog(request: TripRequest): Promise<CatalogResult> {
    if (this.config.ragflow.state === "disabled") {
      return demoCatalog(this.now().toISOString())
    }
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
      if (ragflowConfig.fallbackToDemo) {
        return demoCatalog(this.now().toISOString(), [
          "RAGFlow 근거 데이터를 불러오지 못해 명시적으로 허용된 데모 카탈로그를 사용했어요.",
        ])
      }
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
    const groundingWarnings: string[] = []
    if (places.length === 0) {
      if (ragflowConfig.fallbackToDemo) {
        return demoCatalog(this.now().toISOString(), [
          "RAGFlow에 검색 가능한 검증 장소가 없어 명시적으로 허용된 데모 카탈로그를 사용했어요.",
        ])
      }
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
      places,
      warnings: groundingWarnings,
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

  private async applyKakao(
    request: TripRequest,
    plan: TripPlan,
    integrations: TripIntegrationReport,
    candidatePlaces: readonly Place[],
    externalWarnings: readonly string[],
  ): Promise<TripPlan> {
    if (!this.kakaoClient) return plan
    let matchedPlaceCount = 0
    const searches = await Promise.allSettled(
      plan.stops.map((stop) =>
        this.kakaoClient!.searchKeyword(stop.place.name, stop.place.location, 1_000, 5),
      ),
    )
    const verifiedStops = plan.stops.map((stop, index) => {
      const search = searches[index]
      if (search.status !== "fulfilled") return stop
      const match = closestKakaoMatch(stop.place, search.value)
      if (!match) return stop
      matchedPlaceCount += 1
      return {
        ...stop,
        place: {
          ...stop.place,
          location: match.location,
          address:
            match.address === "주소 정보 없음" ? stop.place.address : match.address,
          externalReferences: {
            ...stop.place.externalReferences,
            kakao: {
              placeId: match.id,
              matchedAt: this.now().toISOString(),
              ...(match.placeUrl ? { placeUrl: match.placeUrl } : {}),
            },
          },
        },
      }
    })
    const verifiedPlan = { ...plan, stops: verifiedStops }

    if (request.transportMode !== "walk") {
      integrations.kakao = {
        state: matchedPlaceCount > 0 ? "applied" : "skipped",
        matchedPlaceCount,
        routeApplied: false,
      }
      return {
        ...verifiedPlan,
        integrations,
        warnings: uniqueWarnings([
          ...verifiedPlan.warnings,
          ...(matchedPlaceCount > 0
            ? [`Kakao 검색으로 추천 장소 ${matchedPlaceCount}곳의 위치를 확인했어요.`]
            : []),
        ]),
      }
    }

    try {
      const routeMode =
        request.companion === "parents" || request.avoids.includes("stairs")
          ? "ACCESSIBLE"
          : "BROAD_FIRST"
      const points = [request.origin, ...verifiedStops.map((stop) => stop.place.location)]
      const route = await this.kakaoClient.walkingRoute(points, routeMode)
      let refined = retimeTripPlanWithWalkingLegs(
        verifiedPlan,
        route.legs,
        route.directionsUrl,
        candidatePlaces,
      )
      let trimmedStopCount = 0

      if (!refined) {
        for (let count = route.legs.length - 1; count >= 1; count -= 1) {
          const prefix = retimeTripPlanWithWalkingLegs(
            verifiedPlan,
            route.legs.slice(0, count),
            undefined,
            candidatePlaces,
          )
          if (!prefix) continue
          try {
            const prefixRoute = await this.kakaoClient.walkingRoute(
              points.slice(0, count + 1),
              routeMode,
            )
            refined =
              retimeTripPlanWithWalkingLegs(
                verifiedPlan,
                prefixRoute.legs,
                prefixRoute.directionsUrl,
                candidatePlaces,
              ) ?? prefix
          } catch {
            // The full Kakao response already supplied constraint-safe exact
            // legs for this prefix. Keep them even if the shorter link request
            // is temporarily unavailable.
            refined = prefix
          }
          trimmedStopCount = plan.stops.length - count
          break
        }
      }

      if (!refined) {
        integrations.kakao = {
          state: "skipped",
          matchedPlaceCount,
          routeApplied: false,
        }
        const safePlan = retimeTripPlanWithWalkingLegs(
          verifiedPlan,
          [],
          undefined,
          candidatePlaces,
        )!
        return {
          ...safePlan,
          integrations,
          warnings: uniqueWarnings([
            ...externalWarnings,
            ...safePlan.warnings.filter(
              (warning) =>
                warning !== "도보 거리와 시간은 직선거리를 보정한 추정치예요.",
            ),
            "Kakao 실제 도보 경로로 시간·거리 조건을 지킬 수 없어 장소를 추천하지 않았어요.",
          ]),
        }
      }

      integrations.kakao = {
        state: "applied",
        matchedPlaceCount,
        routeApplied: true,
      }
      const warnings = [
        ...externalWarnings,
        ...refined.warnings.filter(
          (warning) => warning !== "도보 거리와 시간은 직선거리를 보정한 추정치예요.",
        ),
      ]
      warnings.push("Kakao 도보 경로의 실제 거리와 소요시간으로 일정을 다시 검증했어요.")
      if (trimmedStopCount > 0) {
        warnings.push(
          `실제 도보 경로로도 종료시간과 도보 한도를 지키기 위해 마지막 ${trimmedStopCount}곳을 제외했어요.`,
        )
      }
      return { ...refined, integrations, warnings: uniqueWarnings(warnings) }
    } catch {
      integrations.kakao = {
        state: "unavailable",
        matchedPlaceCount,
        routeApplied: false,
      }
      return {
        ...plan,
        integrations,
        warnings: uniqueWarnings([
          ...plan.warnings,
          "Kakao 장소·도보 경로를 불러오지 못해 기존 좌표 기반 추정 동선을 사용했어요.",
        ]),
      }
    }
  }

  private async applyTourImages(plan: TripPlan): Promise<TripPlan> {
    if (!this.tourApiClient || plan.stops.length === 0) return plan

    const stops = await Promise.all(
      plan.stops.map(async (stop) => {
        if ((stop.place.images?.length ?? 0) >= 3) return stop

        let contentId = stop.place.externalReferences?.tourApi?.contentId
        let matchedPlace: TourApiPlace | undefined

        try {
          if (!contentId) {
            const records = await this.tourApiClient!.searchPlaces(stop.place.name, 10)
            matchedPlace = closestTourImageMatch(stop.place, records)
            contentId = matchedPlace?.contentId
          }
          if (!contentId) return stop

          const officialImages = await this.tourApiClient!.placeImages(contentId, 3)
          const images = [
            ...(stop.place.images ?? []),
            ...officialImages.map((image) => ({
              ...image,
              alt:
                image.alt === "관광지 대표사진"
                  ? `${stop.place.name} 대표사진`
                  : image.alt,
              sourceName: "한국관광공사 TourAPI",
            })),
          ]
            .filter(
              (image, index, all) =>
                all.findIndex((candidate) => candidate.url === image.url) === index,
            )
            .slice(0, 3)
          if (images.length === 0) return stop

          return {
            ...stop,
            place: {
              ...stop.place,
              images,
              ...(matchedPlace
                ? {
                    externalReferences: {
                      ...stop.place.externalReferences,
                      tourApi: {
                        contentId: matchedPlace.contentId,
                        matchedAt: this.now().toISOString(),
                        ...(matchedPlace.modifiedAt
                          ? { modifiedAt: matchedPlace.modifiedAt }
                          : {}),
                      },
                    },
                  }
                : {}),
            },
          }
        } catch {
          return stop
        }
      }),
    )

    return { ...plan, stops }
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
