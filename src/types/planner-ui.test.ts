import { describe, expect, it } from "vitest"

import { DEFAULT_PLANNER_VALUES, ORIGINS } from "./planner-ui.ts"

describe("planner defaults", () => {
  it("uses public transit as the default transport mode", () => {
    expect(DEFAULT_PLANNER_VALUES.transportMode).toBe("transit")
  })

  it("offers representative starting points across Seoul", () => {
    expect(ORIGINS).toHaveLength(14)
    expect(new Set(ORIGINS.map((origin) => origin.key)).size).toBe(ORIGINS.length)
    expect(ORIGINS.map((origin) => origin.label)).toEqual(
      expect.arrayContaining(["광화문", "홍대입구역", "용산역", "강남역", "잠실역", "마곡나루역"]),
    )
  })
})
