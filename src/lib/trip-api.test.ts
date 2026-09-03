import { describe, expect, it } from "vitest"

import { SEOUL_CLUSTER_ORIGINS } from "../data/seoul-places.ts"
import { planTrip } from "./planner.ts"
import { isTripPlan, shouldRequestTripApi } from "./trip-api.ts"

function validPlan() {
  return planTrip({
    origin: SEOUL_CLUSTER_ORIGINS.jongno,
    transportMode: "walk",
    date: "2026-08-29",
    startTime: "10:00",
    endTime: "14:00",
    budgetWon: 10_000,
    maxWalkingKm: 5,
    companion: "couple",
    wants: ["free", "exhibition"],
    avoids: [],
  })
}

describe("isTripPlan", () => {
  it("accepts a complete planner response", () => {
    expect(isTripPlan(validPlan())).toBe(true)
  })

  it("rejects an unsupported transport mode", () => {
    const plan = validPlan()
    expect(isTripPlan({
      ...plan,
      request: { ...plan.request, transportMode: "bicycle" },
    })).toBe(false)
  })

  it("accepts safe representative photos and rejects unsafe image URLs", () => {
    const plan = validPlan()
    const withImages = {
      ...plan,
      stops: plan.stops.map((stop, index) =>
        index === 0
          ? {
              ...stop,
              place: {
                ...stop.place,
                images: [
                  {
                    url: "place-images/test-place.jpg",
                    thumbnailUrl: "https://tong.visitkorea.or.kr/thumb.jpg",
                    alt: "박물관 전경",
                    sourceName: "한국관광공사 TourAPI",
                  },
                ],
              },
            }
          : stop,
      ),
    }
    const unsafeImages = {
      ...withImages,
      stops: withImages.stops.map((stop, index) =>
        index === 0
          ? {
              ...stop,
              place: {
                ...stop.place,
                images: [
                  {
                    ...stop.place.images![0],
                    url: "javascript:alert(1)",
                  },
                ],
              },
            }
          : stop,
      ),
    }

    expect(isTripPlan(withImages)).toBe(true)
    expect(isTripPlan(unsafeImages)).toBe(false)
  })

  it("rejects legacy or malformed price and cost shapes", () => {
    const plan = validPlan()
    const missingMealCost = {
      ...plan,
      costs: Object.fromEntries(
        Object.entries(plan.costs).filter(([key]) => key !== "mealWon"),
      ),
    }
    const missingPriceBasis = {
      ...plan,
      stops: plan.stops.map((stop, index) =>
        index === 0
          ? {
              ...stop,
              place: {
                ...stop.place,
                price: { ...stop.place.price, basis: undefined },
              },
            }
          : stop,
      ),
    }

    expect(isTripPlan(missingMealCost)).toBe(false)
    expect(isTripPlan(missingPriceBasis)).toBe(false)
  })

  it("validates optional live integration and routing metadata", () => {
    const basePlan = validPlan()
    const plan = {
      ...basePlan,
      legs: basePlan.legs.map((leg) => ({ ...leg, provider: "kakao" as const })),
      directionsUrl: "https://map.kakao.com/link/by/walk/test",
      integrations: {
        kma: {
          state: "applied",
          forecastPointCount: 5,
          outdoorPlacesExcluded: 2,
          issuedAt: "2026-08-30T14:30:00+09:00",
        },
        kakao: { state: "applied", matchedPlaceCount: 3, routeApplied: true },
        tourApi: { state: "applied", resultCount: 40, matchedPlaceCount: 2 },
      },
    } as const

    expect(isTripPlan(plan)).toBe(true)
    const withExternalReferences = {
      ...plan,
      stops: plan.stops.map((stop, index) =>
        index === 0
          ? {
              ...stop,
              place: {
                ...stop.place,
                externalReferences: {
                  tourApi: {
                    contentId: "123",
                    matchedAt: "2026-08-30T14:30:00+09:00",
                    modifiedAt: "2026-08-29T10:00:00+09:00",
                  },
                  kakao: {
                    placeId: "456",
                    matchedAt: "2026-08-30T14:31:00+09:00",
                    placeUrl: "https://place.map.kakao.com/456",
                  },
                },
              },
            }
          : stop,
      ),
    }
    expect(isTripPlan(withExternalReferences)).toBe(true)
    expect(
      isTripPlan({
        ...plan,
        integrations: {
          ...plan.integrations,
          kakao: { ...plan.integrations.kakao, routeApplied: "yes" },
        },
      }),
    ).toBe(false)
    expect(
      isTripPlan({
        ...plan,
        directionsUrl: "javascript:alert(1)",
      }),
    ).toBe(false)
    expect(
      isTripPlan({
        ...plan,
        directionsUrl: "https://example.com/untrusted-route",
      }),
    ).toBe(false)
    expect(
      isTripPlan({
        ...plan,
        integrations: {
          ...plan.integrations,
          tourApi: { ...plan.integrations.tourApi, resultCount: -1 },
        },
      }),
    ).toBe(false)
    expect(
      isTripPlan({
        ...withExternalReferences,
        stops: withExternalReferences.stops.map((stop, index) =>
          index === 0
            ? {
                ...stop,
                place: {
                  ...stop.place,
                  externalReferences: {
                    ...stop.place.externalReferences,
                    kakao: {
                      ...stop.place.externalReferences?.kakao,
                      placeUrl: "https://example.com/not-kakao",
                    },
                  },
                },
              }
            : stop,
        ),
      }),
    ).toBe(false)
  })
})

describe("shouldRequestTripApi", () => {
  it("skips API requests for a static optional deployment", () => {
    expect(shouldRequestTripApi("optional", undefined)).toBe(false)
    expect(shouldRequestTripApi("optional", "")).toBe(false)
    expect(shouldRequestTripApi("optional", "/")).toBe(false)
  })

  it("uses a configured backend or a required same-origin API", () => {
    expect(shouldRequestTripApi("optional", "https://api.example.com")).toBe(true)
    expect(shouldRequestTripApi("required", "/")).toBe(true)
    expect(shouldRequestTripApi(undefined, undefined)).toBe(true)
  })
})
