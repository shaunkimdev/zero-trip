import { describe, expect, it } from "vitest"

import { parseTripRequest } from "./trip-request.ts"

const payload = {
  origin: { lat: 37.5765, lng: 126.9854, label: "안국역" },
  date: "2026-08-30",
  startTime: "10:00",
  endTime: "16:00",
  budgetWon: 0,
  maxWalkingKm: 8,
  companion: "couple",
  wants: ["free", "exhibition"],
  avoids: [],
}

describe("parseTripRequest", () => {
  it("defaults requests without a transport mode to transit", () => {
    expect(parseTripRequest(payload).transportMode).toBe("transit")
  })

  it("accepts the three supported transport modes", () => {
    expect(parseTripRequest({ ...payload, transportMode: "walk" }).transportMode).toBe("walk")
    expect(parseTripRequest({ ...payload, transportMode: "transit" }).transportMode).toBe("transit")
    expect(parseTripRequest({ ...payload, transportMode: "car" }).transportMode).toBe("car")
  })

  it("rejects unsupported transport modes", () => {
    expect(() => parseTripRequest({ ...payload, transportMode: "bicycle" })).toThrow(
      "지원하지 않는 이동수단",
    )
  })
})
