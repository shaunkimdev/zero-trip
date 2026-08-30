import { afterEach, describe, expect, it, vi } from "vitest"

import { seoulPlaces } from "../../src/data/seoul-places.ts"
import type { Place, TripRequest } from "../../src/types/trip.ts"
import { loadToolConfig } from "./shared/config.ts"
import { ZeroTripToolManager } from "./tool-manager.ts"

const request: TripRequest = {
  origin: { lat: 37.5765, lng: 126.9854, label: "안국역" },
  transportMode: "walk",
  date: "2026-08-29",
  startTime: "10:00",
  endTime: "16:00",
  budgetWon: 0,
  maxWalkingKm: 8,
  companion: "couple",
  wants: ["free", "exhibition"],
  avoids: [],
  partySize: 1,
  variant: 0,
}

function canonicalRecord(place: Place) {
  return {
    schema_version: "zero-trip.place.v2",
    id: place.id,
    name: place.name,
    cluster: place.cluster,
    category: place.category,
    latitude: place.location.lat,
    longitude: place.location.lng,
    address: place.address,
    summary: place.summary,
    recommended_visit_minutes: place.recommendedVisitMinutes,
    price: {
      kind: place.price.kind,
      basis: place.price.basis,
      adult_won: place.price.adultWon,
      youth_won: place.price.youthWon,
      child_won: place.price.childWon,
      minimum_won: place.price.minimumWon,
      maximum_won: place.price.maximumWon,
      note: place.price.note,
    },
    opening_hours: Object.fromEntries(
      Object.entries(place.openingHours).map(([day, windows]) => [
        day,
        windows.map((window) => ({
          open: window.open,
          close: window.close,
          last_admission_minutes_before_close:
            window.lastAdmissionMinutesBeforeClose,
        })),
      ]),
    ),
    event: place.event
      ? {
          start_date: place.event.startDate,
          end_date: place.event.endDate,
          fixed_start_time: place.event.fixedStartTime,
          requires_reservation: place.event.requiresReservation,
        }
      : null,
    tags: place.tags,
    companions: place.companions,
    avoid_flags: place.avoidFlags,
    amenities: {
      wifi: place.amenities.wifi,
      restroom: place.amenities.restroom,
      accessible: place.amenities.accessible,
      pet_friendly: place.amenities.petFriendly,
    },
    crowd_level: place.crowdLevel,
    source: {
      name: "서울 열린데이터광장",
      url: "https://data.seoul.go.kr/",
      updated_at: new Date().toISOString(),
    },
    availability_note: place.availabilityNote,
  }
}

function configuredManager(overrides: Readonly<Record<string, string>> = {}) {
  return new ZeroTripToolManager(
    loadToolConfig({
      RAGFLOW_BASE_URL: "https://ragflow.example.com",
      RAGFLOW_API_KEY: "rag-secret",
      RAGFLOW_DATASET_IDS: "seoul-places",
      RAGFLOW_ALLOWED_SOURCE_HOSTS: "data.seoul.go.kr",
      ...overrides,
    }),
  )
}

afterEach(() => vi.unstubAllGlobals())

describe("ZeroTripToolManager", () => {
  it("plans only with strictly adapted RAGFlow candidates", async () => {
    const place = seoulPlaces.find((candidate) => candidate.id === "seoul-craft-museum")!
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 0,
            data: {
              total: 3,
              chunks: [
                {
                  id: "valid-place",
                  document_id: "document-1",
                  dataset_id: "seoul-places",
                  content: JSON.stringify(canonicalRecord(place)),
                  similarity: 0.94,
                },
                {
                  id: "invented-price",
                  dataset_id: "seoul-places",
                  content: JSON.stringify({ ...canonicalRecord(place), id: "bad", price: {} }),
                  similarity: 0.99,
                },
                {
                  id: "foreign-dataset",
                  dataset_id: "unconfigured-dataset",
                  content: JSON.stringify({ ...canonicalRecord(place), id: "foreign-place" }),
                  similarity: 0.98,
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )

    const plan = await configuredManager().planTrip(request)

    expect(plan.stops.map((stop) => stop.place.id)).toEqual([place.id])
    expect(plan.costs.totalWon).toBeLessThanOrEqual(request.budgetWon)
    expect(plan.grounding).toMatchObject({
      mode: "ragflow",
      retrievedChunkCount: 3,
      acceptedPlaceCount: 1,
      rejectedChunkCount: 2,
    })
    expect(plan.warnings.join(" ")).toContain("검증을 통과하지 못해 제외")
  })

  it("fails closed on a valid no-hit response instead of mixing in demo places", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ code: 0, data: { total: 0, chunks: [] } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    )

    const plan = await configuredManager().planTrip(request)

    expect(plan.stops).toHaveLength(0)
    expect(plan.grounding?.mode).toBe("ragflow")
    expect(plan.warnings.join(" ")).toContain("임의 장소를 추천하지 않았어요")
  })

  it("uses the visibly labelled demo catalog when an explicit no-hit fallback is enabled", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            code: 102,
            message: "No chunk found! Check the chunk status please!",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    )

    const plan = await configuredManager({ RAGFLOW_FALLBACK_TO_DEMO: "true" }).planTrip(
      request,
    )

    expect(plan.stops.length).toBeGreaterThan(0)
    expect(plan.grounding).toMatchObject({
      mode: "demo",
      provider: expect.stringContaining("데모"),
    })
    expect(plan.warnings.join(" ")).toContain("RAGFlow에 검색 가능한 검증 장소가 없어")
  })

  it("uses a visibly labelled demo plan only when RAGFlow is unconfigured", async () => {
    const plan = await new ZeroTripToolManager(loadToolConfig({})).planTrip(request)

    expect(plan.stops.length).toBeGreaterThan(0)
    expect(plan.grounding).toMatchObject({ mode: "demo", provider: expect.stringContaining("데모") })
  })

  it("rejects nearby photos when only a partial title, wrong category, or distant record matches", async () => {
    let searchRequestCount = 0
    let imageRequestCount = 0
    const compatibleContentType = (place: Place) => {
      if (place.category === "cafe" || place.category === "restaurant") return "39"
      if (place.category === "event" || place.category === "performance") return "15"
      if (["museum", "exhibition", "rest"].includes(place.category)) return "14"
      return "12"
    }
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/KorService2/locationBasedList2")) {
        return new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "0000", resultMsg: "OK" },
              body: { items: "" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.pathname.endsWith("/KorService2/searchKeyword2")) {
        searchRequestCount += 1
        const keyword = url.searchParams.get("keyword") ?? ""
        const place = seoulPlaces.find((candidate) => candidate.name === keyword)!
        const correctType = compatibleContentType(place)
        const wrongType = correctType === "39" ? "14" : "39"
        return new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "0000", resultMsg: "OK" },
              body: {
                items: {
                  item: [
                    {
                      contentid: `partial-${place.id}`,
                      contenttypeid: correctType,
                      title: `${place.name} 별관`,
                      addr1: place.address,
                      mapx: String(place.location.lng),
                      mapy: String(place.location.lat),
                    },
                    {
                      contentid: `wrong-category-${place.id}`,
                      contenttypeid: wrongType,
                      title: place.name,
                      addr1: place.address,
                      mapx: String(place.location.lng),
                      mapy: String(place.location.lat),
                    },
                    {
                      contentid: `far-${place.id}`,
                      contenttypeid: correctType,
                      title: place.name,
                      addr1: place.address,
                      mapx: String(place.location.lng + 0.03),
                      mapy: String(place.location.lat + 0.03),
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.pathname.endsWith("/KorService2/detailImage2")) {
        imageRequestCount += 1
        throw new Error("A low-confidence record must not be used for photos.")
      }
      throw new Error(`Unexpected upstream request: ${url.origin}${url.pathname}`)
    })
    const manager = new ZeroTripToolManager(
      loadToolConfig({ TOUR_API_SERVICE_KEY: "tour-secret" }),
      { fetchImplementation: fetchImplementation as typeof fetch },
    )

    const plan = await manager.planTrip(request)
    const liveTourImages = plan.stops.flatMap((stop) =>
      (stop.place.images ?? []).filter(
        (image) => image.sourceName === "한국관광공사 TourAPI",
      ),
    )

    expect(searchRequestCount).toBeGreaterThan(0)
    expect(imageRequestCount).toBe(0)
    expect(liveTourImages).toEqual([])
  })

  it("attaches TourAPI photos after an exact title, category, and coordinate match", async () => {
    let imageRequestCount = 0
    const target = seoulPlaces.find(
      (candidate) => candidate.id === "seoul-craft-museum",
    )!
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/KorService2/locationBasedList2")) {
        return new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "0000", resultMsg: "OK" },
              body: { items: "" },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.pathname.endsWith("/KorService2/searchKeyword2")) {
        const keyword = url.searchParams.get("keyword")
        const item =
          keyword === target.name
            ? {
                contentid: "exact-craft",
                contenttypeid: "14",
                title: target.name,
                addr1: target.address,
                mapx: String(target.location.lng),
                mapy: String(target.location.lat),
              }
            : ""
        return new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "0000", resultMsg: "OK" },
              body: { items: { item } },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.pathname.endsWith("/KorService2/detailImage2")) {
        imageRequestCount += 1
        expect(url.searchParams.get("contentId")).toBe("exact-craft")
        return new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "0000", resultMsg: "OK" },
              body: {
                items: {
                  item: [1, 2, 3].map((index) => ({
                    contentid: "exact-craft",
                    originimgurl: `https://tong.visitkorea.or.kr/exact-craft-${index}.jpg`,
                    imgname: `서울공예박물관 ${index}`,
                  })),
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      throw new Error(`Unexpected upstream request: ${url.origin}${url.pathname}`)
    })
    const manager = new ZeroTripToolManager(
      loadToolConfig({ TOUR_API_SERVICE_KEY: "tour-secret" }),
      { fetchImplementation: fetchImplementation as typeof fetch },
    )

    const plan = await manager.planTrip(request)
    const craft = plan.stops.find((stop) => stop.place.id === target.id)

    expect(imageRequestCount).toBe(1)
    expect(craft?.place.externalReferences?.tourApi?.contentId).toBe("exact-craft")
    expect(craft?.place.images).toHaveLength(3)
    expect(
      craft?.place.images?.every(
        (image) => image.sourceName === "한국관광공사 TourAPI",
      ),
    ).toBe(true)
  })

  it("applies KMA, TourAPI, and Kakao enrichments to the shared planning pipeline", async () => {
    const fetchImplementation = vi.fn(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(String(input))

        if (url.pathname.endsWith("/getVilageFcst")) {
          return new Response(
            JSON.stringify({
              response: {
                header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
                body: {
                  items: {
                    item: [
                      {
                        fcstDate: "20260829",
                        fcstTime: "1000",
                        category: "PTY",
                        fcstValue: "1",
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }

        if (url.pathname.endsWith("/KorService2/locationBasedList2")) {
          const place = seoulPlaces.find(
            (candidate) => candidate.id === "seoul-craft-museum",
          )!
          return new Response(
            JSON.stringify({
              response: {
                header: { resultCode: "0000", resultMsg: "OK" },
                body: {
                  items: {
                    item: {
                      contentid: "tour-craft",
                      contenttypeid: "14",
                      title: place.name,
                      addr1: place.address,
                      mapx: String(place.location.lng),
                      mapy: String(place.location.lat),
                    },
                  },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }

        if (url.pathname.endsWith("/KorService2/detailImage2")) {
          expect(url.searchParams.get("contentId")).toBe("tour-craft")
          return new Response(
            JSON.stringify({
              response: {
                header: { resultCode: "0000", resultMsg: "OK" },
                body: {
                  items: {
                    item: [
                      {
                        originimgurl: "https://tong.visitkorea.or.kr/craft-1.jpg",
                        smallimageurl: "https://tong.visitkorea.or.kr/craft-1-thumb.jpg",
                        imgname: "서울공예박물관 외관",
                      },
                      {
                        originimgurl: "https://tong.visitkorea.or.kr/craft-2.jpg",
                        smallimageurl: "https://tong.visitkorea.or.kr/craft-2-thumb.jpg",
                        imgname: "서울공예박물관 전시",
                      },
                      {
                        originimgurl: "https://tong.visitkorea.or.kr/craft-3.jpg",
                        smallimageurl: "https://tong.visitkorea.or.kr/craft-3-thumb.jpg",
                        imgname: "서울공예박물관 전시실",
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }

        if (url.pathname.endsWith("/v2/local/search/keyword.json")) {
          expect(new Headers(init?.headers).get("Authorization")).toBe(
            "KakaoAK kakao-secret",
          )
          return new Response(
            JSON.stringify({
              documents: [
                {
                  id: `kakao-${url.searchParams.get("query")}`,
                  place_name: url.searchParams.get("query"),
                  category_name: "여행 > 명소",
                  road_address_name: "카카오 검증 주소",
                  x: url.searchParams.get("x"),
                  y: url.searchParams.get("y"),
                  distance: "0",
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }

        if (url.pathname.endsWith("/v2/routing/walk")) {
          const viaCount = url.searchParams.get("via_x")?.split(",").length ?? 0
          const legCount = viaCount + 1
          return new Response(
            JSON.stringify({
              status: "OK",
              route: {
                properties: {
                  totalDistance: legCount * 100,
                  totalTime: legCount * 120,
                  landingUrl: "https://map.kakao.com/link/by/walk/zero-trip",
                },
                legs: Array.from({ length: legCount }, () => ({
                  properties: { distance: 100, time: 120 },
                })),
              },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          )
        }

        throw new Error(`Unexpected upstream request: ${url.origin}${url.pathname}`)
      },
    )
    const manager = new ZeroTripToolManager(
      loadToolConfig({
        KMA_SERVICE_KEY: "kma-secret",
        KAKAO_REST_API_KEY: "kakao-secret",
        TOUR_API_SERVICE_KEY: "tour-secret",
      }),
      {
        fetchImplementation: fetchImplementation as typeof fetch,
        now: () => new Date("2026-08-29T01:50:00.000Z"),
      },
    )

    const plan = await manager.planTrip(request)

    expect(plan.integrations).toMatchObject({
      kma: { state: "applied", outdoorPlacesExcluded: expect.any(Number) },
      tourApi: { state: "applied", matchedPlaceCount: 1 },
      kakao: { state: "applied", routeApplied: true },
    })
    expect(plan.integrations?.kma?.outdoorPlacesExcluded).toBe(0)
    expect(plan.warnings).toContain(
      "기상청 예보에 비·눈 가능성이 있어 야외 투어는 유지하되 우산과 노면 상태를 확인해 주세요.",
    )
    expect(plan.integrations?.kakao?.matchedPlaceCount).toBe(plan.stops.length)
    expect(plan.legs.every((leg) => leg.provider === "kakao")).toBe(true)
    expect(
      plan.stops.every((stop) => stop.place.externalReferences?.kakao !== undefined),
    ).toBe(true)
    expect(
      plan.stops.find((stop) => stop.place.id === "seoul-craft-museum")?.place
        .externalReferences?.tourApi,
    ).toMatchObject({ contentId: "tour-craft" })
    expect(
      plan.stops.find((stop) => stop.place.id === "seoul-craft-museum")?.place.images,
    ).toHaveLength(3)
    expect(plan.directionsUrl).toBe(
      "https://map.kakao.com/link/by/walk/zero-trip",
    )
  })

  it("fails closed when every Kakao exact-route prefix violates hard constraints", async () => {
    const baseline = await new ZeroTripToolManager(loadToolConfig({})).planTrip(request)
    expect(baseline.stops.length).toBeGreaterThan(1)
    let routeCallCount = 0
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/v2/local/search/keyword.json")) {
        return new Response(JSON.stringify({ documents: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (url.pathname.endsWith("/v2/routing/walk")) {
        routeCallCount += 1
        const legCount = (url.searchParams.get("via_x")?.split(",").length ?? 0) + 1
        return new Response(
          JSON.stringify({
            status: "OK",
            route: {
              properties: {
                totalDistance: legCount * 3_000,
                totalTime: legCount * 120,
              },
              legs: Array.from({ length: legCount }, () => ({
                properties: { distance: 3_000, time: 120 },
              })),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      throw new Error(`Unexpected upstream request: ${url.origin}${url.pathname}`)
    })
    const manager = new ZeroTripToolManager(
      loadToolConfig({ KAKAO_REST_API_KEY: "kakao-secret" }),
      { fetchImplementation: fetchImplementation as typeof fetch },
    )

    const plan = await manager.planTrip(request)

    expect(routeCallCount).toBe(1)
    expect(plan.stops).toHaveLength(0)
    expect(plan.legs).toHaveLength(0)
    expect(plan.totals).toMatchObject({ stopCount: 0, walkingMeters: 0 })
    expect(plan.integrations?.kakao).toMatchObject({
      state: "skipped",
      routeApplied: false,
    })
    expect(plan.warnings.join(" ")).toContain("장소를 추천하지 않았어요")
    expect(plan.warnings.join(" ")).not.toContain("직선거리를 보정한 추정치")
  })

  it("keeps a verified exact prefix when Kakao prefix-link requery fails", async () => {
    const baseline = await new ZeroTripToolManager(loadToolConfig({})).planTrip(request)
    expect(baseline.stops.length).toBeGreaterThan(1)
    let routeCallCount = 0
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/v2/local/search/keyword.json")) {
        return new Response(JSON.stringify({ documents: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      }
      if (url.pathname.endsWith("/v2/routing/walk")) {
        routeCallCount += 1
        if (routeCallCount > 1) {
          return new Response("temporarily unavailable", { status: 503 })
        }
        const legCount = (url.searchParams.get("via_x")?.split(",").length ?? 0) + 1
        const distances = Array.from(
          { length: legCount },
          (_, index) => (index === legCount - 1 ? 3_000 : 100),
        )
        return new Response(
          JSON.stringify({
            status: "OK",
            route: {
              properties: {
                totalDistance: distances.reduce((total, value) => total + value, 0),
                totalTime: legCount * 120,
              },
              legs: distances.map((distance) => ({
                properties: { distance, time: 120 },
              })),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      throw new Error(`Unexpected upstream request: ${url.origin}${url.pathname}`)
    })
    const manager = new ZeroTripToolManager(
      loadToolConfig({ KAKAO_REST_API_KEY: "kakao-secret" }),
      { fetchImplementation: fetchImplementation as typeof fetch },
    )

    const plan = await manager.planTrip(request)

    expect(routeCallCount).toBe(2)
    expect(plan.stops).toHaveLength(baseline.stops.length - 1)
    expect(plan.legs.every((leg) => leg.provider === "kakao")).toBe(true)
    expect(plan.directionsUrl).toBeUndefined()
    expect(plan.integrations?.kakao).toMatchObject({
      state: "applied",
      routeApplied: true,
    })
    expect(plan.warnings.join(" ")).toContain("마지막 1곳을 제외했어요")
    expect(plan.warnings.join(" ")).not.toContain("직선거리를 보정한 추정치")
  })

  it("excludes an outdoor-tag-only place when KMA reports risky weather", async () => {
    const sourcePlace = seoulPlaces.find(
      (candidate) => candidate.id === "gwanghwamun-square",
    )!
    const outdoorTagOnly: Place = {
      ...sourcePlace,
      tags: [...sourcePlace.tags, "indoor"],
      avoidFlags: [],
    }
    expect(outdoorTagOnly.tags).toContain("outdoor")
    expect(outdoorTagOnly.tags).toContain("indoor")
    expect(outdoorTagOnly.avoidFlags).not.toContain("outdoors")
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith("/api/v1/retrieval")) {
        return new Response(
          JSON.stringify({
            code: 0,
            data: {
              total: 1,
              chunks: [
                {
                  id: "outdoor-tag-only",
                  document_id: "document-outdoor",
                  dataset_id: "seoul-places",
                  content: JSON.stringify(canonicalRecord(outdoorTagOnly)),
                  similarity: 0.99,
                },
              ],
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      if (url.pathname.endsWith("/getUltraSrtFcst")) {
        return new Response(
          JSON.stringify({
            response: {
              header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
              body: {
                items: {
                  item: [
                    {
                      fcstDate: "20260829",
                      fcstTime: "1000",
                      category: "PTY",
                      fcstValue: "1",
                    },
                    {
                      fcstDate: "20260829",
                      fcstTime: "1000",
                      category: "RN1",
                      fcstValue: "30",
                    },
                  ],
                },
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      throw new Error(`Unexpected upstream request: ${url.origin}${url.pathname}`)
    })
    const manager = new ZeroTripToolManager(
      loadToolConfig({
        RAGFLOW_BASE_URL: "https://ragflow.example.com",
        RAGFLOW_API_KEY: "rag-secret",
        RAGFLOW_DATASET_IDS: "seoul-places",
        RAGFLOW_ALLOWED_SOURCE_HOSTS: "data.seoul.go.kr",
        KMA_SERVICE_KEY: "kma-secret",
      }),
      {
        fetchImplementation: fetchImplementation as typeof fetch,
        now: () => new Date("2026-08-29T00:50:00.000Z"),
      },
    )

    const plan = await manager.planTrip({ ...request, endTime: "14:00" })

    expect(plan.integrations?.kma).toMatchObject({
      state: "applied",
      forecastPointCount: 1,
      outdoorPlacesExcluded: 1,
    })
    expect(plan.stops).toHaveLength(0)
  })
})
