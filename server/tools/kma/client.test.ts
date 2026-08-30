import { describe, expect, it, vi } from "vitest"

import { KmaClient, latLonToKmaGrid, summarizeKmaForecast } from "./client.ts"

function kmaResponse(items: unknown, totalCount?: number) {
  return new Response(
    JSON.stringify({
      response: {
        header: { resultCode: "00", resultMsg: "NORMAL_SERVICE" },
        body: {
          items,
          ...(totalCount === undefined ? {} : { totalCount }),
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  )
}

const seoul = { lat: 37.5665, lng: 126.978 }

describe("KmaClient", () => {
  it("converts Seoul coordinates to the official forecast grid", () => {
    expect(latLonToKmaGrid(seoul)).toEqual({ nx: 60, ny: 127 })
    expect(latLonToKmaGrid({ lat: 37.488201, lng: 126.92981 })).toEqual({ nx: 59, ny: 125 })
    expect(() => latLonToKmaGrid({ lat: 30, lng: 120 })).toThrow(RangeError)
  })

  it("requests the latest published KST slot and groups the requested forecast window", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.pathname).toContain("/getUltraSrtFcst")
      expect(url.searchParams.get("serviceKey")).toBe("encoded+key==")
      expect(url.searchParams.get("base_date")).toBe("20260830")
      expect(url.searchParams.get("base_time")).toBe("1430")
      expect(url.searchParams.get("nx")).toBe("60")
      expect(url.searchParams.get("ny")).toBe("127")
      return kmaResponse({
        item: [
          { fcstDate: "20260830", fcstTime: "1600", category: "T1H", fcstValue: "28" },
          { fcstDate: "20260830", fcstTime: "1600", category: "PTY", fcstValue: "1" },
          { fcstDate: "20260830", fcstTime: "1600", category: "RN1", fcstValue: "1mm 미만" },
          { fcstDate: "20260830", fcstTime: "2200", category: "PTY", fcstValue: "0" },
        ],
      })
    })
    const client = new KmaClient(
      { serviceKey: "encoded%2Bkey%3D%3D", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
      () => new Date("2026-08-30T05:50:00.000Z"),
    )

    const forecast = await client.forecast({
      location: seoul,
      date: "2026-08-30",
      startTime: "15:00",
      endTime: "18:00",
    })

    expect(forecast.points).toEqual([
      expect.objectContaining({
        date: "2026-08-30",
        time: "16:00",
        temperatureC: 28,
        precipitationType: 1,
        precipitationMm: 0.5,
      }),
    ])
    expect(summarizeKmaForecast(forecast)).toMatchObject({
      outdoorRisk: false,
      precipitation: true,
      heavyPrecipitation: false,
    })
  })

  it("uses the official village forecast for a future itinerary and parses its categories", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.pathname).toContain("/getVilageFcst")
      expect(url.searchParams.get("serviceKey")).toBe("decoded+key==")
      expect(url.searchParams.get("base_date")).toBe("20260830")
      expect(url.searchParams.get("base_time")).toBe("1400")
      return kmaResponse({
        item: [
          { fcstDate: "20260831", fcstTime: "1000", category: "TMP", fcstValue: "27" },
          { fcstDate: "20260831", fcstTime: "1000", category: "REH", fcstValue: "72" },
          { fcstDate: "20260831", fcstTime: "1000", category: "POP", fcstValue: "80" },
          { fcstDate: "20260831", fcstTime: "1000", category: "PTY", fcstValue: "1" },
          { fcstDate: "20260831", fcstTime: "1000", category: "PCP", fcstValue: "30.0~50.0mm" },
          { fcstDate: "20260831", fcstTime: "1000", category: "SKY", fcstValue: "4" },
          { fcstDate: "20260831", fcstTime: "1000", category: "WSD", fcstValue: "3.2" },
        ],
      })
    })
    const client = new KmaClient(
      { serviceKey: "decoded+key==", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
      () => new Date("2026-08-30T05:50:00.000Z"),
    )

    const forecast = await client.forecast({
      location: seoul,
      date: "2026-08-31",
      startTime: "10:00",
      endTime: "12:00",
    })

    expect(forecast.issuedAt).toBe("2026-08-30T14:00:00+09:00")
    expect(forecast.points).toEqual([
      expect.objectContaining({
        date: "2026-08-31",
        time: "10:00",
        temperatureC: 27,
        humidityPercent: 72,
        precipitationProbabilityPercent: 80,
        precipitationType: 1,
        precipitationMm: 50,
        sky: 4,
        windSpeedMps: 3.2,
      }),
    ])
    expect(summarizeKmaForecast(forecast)).toMatchObject({
      outdoorRisk: true,
      precipitation: true,
      heavyPrecipitation: true,
    })
  })

  it.each([
    {
      label: "before the ultra forecast publication boundary across midnight",
      now: "2026-08-29T15:40:00.000Z",
      expectedDate: "20260829",
      expectedTime: "2330",
    },
    {
      label: "at the ultra forecast publication boundary",
      now: "2026-08-29T15:45:00.000Z",
      expectedDate: "20260830",
      expectedTime: "0030",
    },
  ])("selects the KST slot $label", async ({ now, expectedDate, expectedTime }) => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.pathname).toContain("/getUltraSrtFcst")
      expect(url.searchParams.get("base_date")).toBe(expectedDate)
      expect(url.searchParams.get("base_time")).toBe(expectedTime)
      return kmaResponse({
        item: { fcstDate: "20260830", fcstTime: "0100", category: "T1H", fcstValue: "24" },
      })
    })
    const client = new KmaClient(
      { serviceKey: "key", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
      () => new Date(now),
    )

    const result = await client.forecast({
      location: seoul,
      date: "2026-08-30",
      startTime: "01:00",
      endTime: "02:00",
    })

    expect(result.points).toHaveLength(1)
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it.each([
    {
      label: "before the village forecast publication boundary",
      now: "2026-08-29T17:09:00.000Z",
      expectedDate: "20260829",
      expectedTime: "2300",
    },
    {
      label: "at the village forecast publication boundary",
      now: "2026-08-29T17:10:00.000Z",
      expectedDate: "20260830",
      expectedTime: "0200",
    },
  ])("selects the KST slot $label", async ({ now, expectedDate, expectedTime }) => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.pathname).toContain("/getVilageFcst")
      expect(url.searchParams.get("base_date")).toBe(expectedDate)
      expect(url.searchParams.get("base_time")).toBe(expectedTime)
      return kmaResponse({
        item: { fcstDate: "20260831", fcstTime: "1000", category: "TMP", fcstValue: "24" },
      })
    })
    const client = new KmaClient(
      { serviceKey: "key", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
      () => new Date(now),
    )

    const result = await client.forecast({
      location: seoul,
      date: "2026-08-31",
      startTime: "10:00",
      endTime: "11:00",
    })

    expect(result.points).toHaveLength(1)
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it("falls back one publication only for NO_DATA", async () => {
    const requestedSlots: string[] = []
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      requestedSlots.push(`${url.searchParams.get("base_date")}-${url.searchParams.get("base_time")}`)
      if (requestedSlots.length === 1) {
        return new Response(
          JSON.stringify({
            response: { header: { resultCode: "03", resultMsg: "NODATA_ERROR" } },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        )
      }
      return kmaResponse({
        item: { fcstDate: "20260830", fcstTime: "1600", category: "T1H", fcstValue: "28" },
      })
    })
    const client = new KmaClient(
      { serviceKey: "key", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
      () => new Date("2026-08-30T05:50:00.000Z"),
    )

    const result = await client.forecast({
      location: seoul,
      date: "2026-08-30",
      startTime: "15:00",
      endTime: "18:00",
    })

    expect(requestedSlots).toEqual(["20260830-1430", "20260830-1330"])
    expect(result.issuedAt).toBe("2026-08-30T13:30:00+09:00")
    expect(result.points).toHaveLength(1)
  })

  it("does not use an older publication for non-NODATA API errors", async () => {
    const fetchImplementation = vi.fn(async () =>
      new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "10", resultMsg: "INVALID_REQUEST_PARAMETER_ERROR" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )
    const client = new KmaClient(
      { serviceKey: "key", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
      () => new Date("2026-08-30T06:50:00.000Z"),
    )

    await expect(
      client.forecast({
        location: seoul,
        date: "2026-08-30",
        startTime: "15:00",
        endTime: "18:00",
      }),
    ).rejects.toThrow("(10: INVALID_REQUEST_PARAMETER_ERROR)")
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })

  it("falls back for an actually empty response but not for a non-matching date", async () => {
    const slots: string[] = []
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      slots.push(String(url.searchParams.get("base_time")))
      if (slots.length === 1) return kmaResponse({ item: "" }, 0)
      return kmaResponse({
        item: { fcstDate: "20260905", fcstTime: "1000", category: "TMP", fcstValue: "25" },
      })
    })
    const client = new KmaClient(
      { serviceKey: "key", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
      () => new Date("2026-08-30T06:50:00.000Z"),
    )

    const result = await client.forecast({
      location: seoul,
      date: "2026-09-06",
      startTime: "10:00",
      endTime: "11:00",
    })

    expect(slots).toEqual(["1400", "1100"])
    expect(result.points).toEqual([])
  })
})
