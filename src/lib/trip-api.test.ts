import { describe, expect, it } from "vitest"

import { SEOUL_CLUSTER_ORIGINS } from "../data/seoul-places.ts"
import { planTrip } from "./planner.ts"
import { isTripPlan } from "./trip-api.ts"

function validPlan() {
  return planTrip({
    origin: SEOUL_CLUSTER_ORIGINS.jongno,
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
})
