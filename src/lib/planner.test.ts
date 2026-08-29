import { describe, expect, it } from "vitest"

import { SEOUL_CLUSTER_ORIGINS, seoulPlaces } from "../data/seoul-places"
import type { Place, TripRequest } from "../types/trip"
import { placeMatchesInterest, planTrip } from "./planner"

const saturdayRequest: TripRequest = {
  origin: SEOUL_CLUSTER_ORIGINS.jongno,
  date: "2026-08-15",
  startTime: "10:00",
  endTime: "20:00",
  budgetWon: 0,
  maxWalkingKm: 8,
  companion: "couple",
  wants: ["free", "exhibition", "walk", "night-view"],
  avoids: [],
}

function timeToMinute(value: string): number {
  const [hours, minutes] = value.split(":").map(Number)
  return hours * 60 + minutes
}

const restaurantHours: Place["openingHours"] = {
  sun: [{ open: "09:00", close: "22:00" }],
  mon: [{ open: "09:00", close: "22:00" }],
  tue: [{ open: "09:00", close: "22:00" }],
  wed: [{ open: "09:00", close: "22:00" }],
  thu: [{ open: "09:00", close: "22:00" }],
  fri: [{ open: "09:00", close: "22:00" }],
  sat: [{ open: "09:00", close: "22:00" }],
}

function restaurantPlace(
  id: string,
  minimumWon: number,
  maximumWon: number,
): Place {
  return {
    ...seoulPlaces[0],
    id,
    name: id,
    category: "restaurant",
    location: SEOUL_CLUSTER_ORIGINS.jongno,
    recommendedVisitMinutes: 60,
    price: {
      kind: "paid",
      basis: "per-person",
      adultWon: null,
      youthWon: null,
      childWon: null,
      minimumWon,
      maximumWon,
      note: "1인 메뉴 가격대",
    },
    openingHours: restaurantHours,
    tags: ["food"],
    companions: ["couple"],
    avoidFlags: [],
  }
}

describe("Seoul demo catalog", () => {
  it("contains enough places across all MVP clusters and preserves price certainty", () => {
    expect(seoulPlaces.length).toBeGreaterThanOrEqual(18)
    expect(new Set(seoulPlaces.map((place) => place.cluster))).toEqual(
      new Set(["jongno", "seongsu", "yeouido-mapo"]),
    )
    expect(new Set(seoulPlaces.map((place) => place.price.kind))).toEqual(
      new Set(["free", "paid", "unknown"]),
    )
    expect(seoulPlaces.some((place) => place.amenities.wifi.available)).toBe(true)
  })
})

describe("planTrip", () => {
  it("keeps every hard budget, walking and time invariant", () => {
    const request: TripRequest = {
      ...saturdayRequest,
      origin: SEOUL_CLUSTER_ORIGINS.seongsu,
      budgetWon: 25_000,
      maxWalkingKm: 5.5,
      wants: ["exhibition", "culture", "rest"],
    }
    const result = planTrip(request)
    const requestStart = timeToMinute(request.startTime)
    const requestEnd = timeToMinute(request.endTime)

    expect(result.stops.length).toBeGreaterThan(0)
    expect(result.costs.totalWon).toBeLessThanOrEqual(request.budgetWon)
    expect(result.totals.contentCostWon).toBe(result.costs.totalWon)
    expect(result.totals.walkingMeters).toBeLessThanOrEqual(request.maxWalkingKm * 1_000)
    expect(result.totals.durationMinutes).toBeLessThanOrEqual(requestEnd - requestStart)
    expect(result.legs).toHaveLength(result.stops.length)
    expect(result.legs.reduce((sum, leg) => sum + leg.distanceMeters, 0)).toBe(
      result.totals.walkingMeters,
    )
    expect(result.stops.reduce((sum, stop) => sum + stop.costWon, 0)).toBe(
      result.costs.totalWon,
    )

    for (const stop of result.stops) {
      expect(stop.arriveMinute).toBeGreaterThanOrEqual(requestStart)
      expect(stop.startMinute).toBeGreaterThanOrEqual(stop.arriveMinute)
      expect(stop.departMinute).toBeGreaterThan(stop.startMinute)
      expect(stop.departMinute).toBeLessThanOrEqual(requestEnd)
    }
  })

  it("uses only explicitly free places for a zero-won route", () => {
    const result = planTrip(saturdayRequest)

    expect(result.stops.length).toBeGreaterThanOrEqual(3)
    expect(result.title).toBe("2026년 8월 15일 0원 데이트")
    expect(result.costs.totalWon).toBe(0)
    expect(result.stops.every((stop) => stop.place.price.kind === "free")).toBe(true)
    expect(result.stops.some((stop) => stop.place.price.kind === "unknown")).toBe(false)
  })

  it("changes the leading recommendation with a strong preference", () => {
    const compactBase: TripRequest = {
      ...saturdayRequest,
      origin: SEOUL_CLUSTER_ORIGINS.seongsu,
      startTime: "10:00",
      endTime: "11:30",
      maxWalkingKm: 2,
      wants: ["exhibition"],
    }
    const exhibitionPlan = planTrip(compactBase)
    const parkPlan = planTrip({ ...compactBase, wants: ["park", "walk"] })

    expect(exhibitionPlan.stops).toHaveLength(1)
    expect(parkPlan.stops).toHaveLength(1)
    expect(placeMatchesInterest(exhibitionPlan.stops[0].place, "exhibition")).toBe(true)
    expect(placeMatchesInterest(parkPlan.stops[0].place, "park")).toBe(true)
    expect(exhibitionPlan.stops[0].place.id).not.toBe(parkPlan.stops[0].place.id)
  })

  it("treats avoided traits as hard exclusions", () => {
    const result = planTrip({
      ...saturdayRequest,
      endTime: "14:00",
      maxWalkingKm: 4,
      wants: ["exhibition", "culture", "rest"],
      avoids: ["outdoors", "crowds", "waiting"],
    })

    expect(result.stops.length).toBeGreaterThan(0)
    for (const stop of result.stops) {
      expect(stop.place.avoidFlags).not.toContain("outdoors")
      expect(stop.place.avoidFlags).not.toContain("crowds")
      expect(stop.place.avoidFlags).not.toContain("waiting")
      expect(stop.place.crowdLevel).not.toBe("high")
    }
  })

  it("returns the same route for the same request", () => {
    expect(planTrip(saturdayRequest)).toEqual(planTrip(saturdayRequest))
  })

  it("schedules requested night views in the evening window", () => {
    const result = planTrip(saturdayRequest)
    const nightStops = result.stops.filter((stop) =>
      placeMatchesInterest(stop.place, "night-view"),
    )

    expect(nightStops.length).toBeGreaterThan(0)
    expect(nightStops.every((stop) => stop.startMinute >= 17 * 60 + 30)).toBe(true)
  })

  it("limits schedule waiting when the user avoids waiting", () => {
    const result = planTrip({
      ...saturdayRequest,
      origin: SEOUL_CLUSTER_ORIGINS["yeouido-mapo"],
      startTime: "09:00",
      endTime: "20:00",
      maxWalkingKm: 12,
      companion: "solo",
      wants: ["performance"],
      avoids: ["waiting"],
    })

    expect(result.stops.every((stop) => stop.waitMinutes <= 15)).toBe(true)
  })

  it("anchors an explicitly requested fixed-time performance", () => {
    const result = planTrip({
      ...saturdayRequest,
      origin: SEOUL_CLUSTER_ORIGINS["yeouido-mapo"],
      startTime: "10:00",
      endTime: "20:00",
      maxWalkingKm: 12,
      companion: "solo",
      wants: ["performance"],
      avoids: [],
    })

    expect(result.stops.some((stop) => placeMatchesInterest(stop.place, "performance"))).toBe(true)
  })

  it("uses paid cafe budget only when it is available", () => {
    const paidPlan = planTrip({
      ...saturdayRequest,
      budgetWon: 10_000,
      wants: ["cafe", "rest"],
    })
    const freePlan = planTrip({
      ...saturdayRequest,
      budgetWon: 0,
      wants: ["cafe", "rest"],
    })

    expect(paidPlan.costs.cafeWon).toBeGreaterThan(0)
    expect(paidPlan.costs.totalWon).toBeLessThanOrEqual(10_000)
    expect(freePlan.costs.cafeWon).toBe(0)
  })

  it("budgets restaurants at the per-person maximum and records the cost as a meal", () => {
    const affordable = restaurantPlace("restaurant-affordable", 2_000, 4_000)
    const minimumOnlyAffordable = restaurantPlace("restaurant-over-budget", 1_000, 5_000)
    const request: TripRequest = {
      ...saturdayRequest,
      startTime: "10:00",
      endTime: "13:00",
      budgetWon: 9_000,
      maxWalkingKm: 1,
      companion: "couple",
      partySize: 2,
      wants: ["food"],
    }

    const result = planTrip(request, [affordable, minimumOnlyAffordable])

    expect(result.stops.map((stop) => stop.place.id)).toEqual([affordable.id])
    expect(result.stops[0].costWon).toBe(affordable.price.maximumWon! * request.partySize!)
    expect(result.costs.mealWon).toBe(8_000)
    expect(result.costs.totalWon).toBe(8_000)
    expect(result.costs.totalWon).toBeLessThanOrEqual(request.budgetWon)

    const belowMaximumPlan = planTrip(
      { ...request, budgetWon: 7_999 },
      [affordable],
    )
    expect(belowMaximumPlan.stops).toHaveLength(0)
    expect(belowMaximumPlan.costs.mealWon).toBe(0)
    expect(belowMaximumPlan.costs.totalWon).toBeLessThanOrEqual(7_999)
  })

  it("returns a different top route for the next deterministic variant", () => {
    const first = planTrip({ ...saturdayRequest, variant: 0 })
    const second = planTrip({ ...saturdayRequest, variant: 1 })

    expect(first.stops.map((stop) => stop.place.id)).not.toEqual(
      second.stops.map((stop) => stop.place.id),
    )
  })

  it("returns a useful warning instead of violating impossible constraints", () => {
    const result = planTrip({
      ...saturdayRequest,
      origin: { label: "멀리 떨어진 출발점", lat: 37.3, lng: 127.3 },
      startTime: "10:00",
      endTime: "11:00",
      maxWalkingKm: 0,
    })

    expect(result.stops).toHaveLength(0)
    expect(result.costs.totalWon).toBe(0)
    expect(result.totals.walkingMeters).toBe(0)
    expect(result.warnings[0]).toContain("찾지 못했어요")
  })
})
