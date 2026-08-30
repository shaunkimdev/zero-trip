import { describe, expect, it, vi } from "vitest"

import { KakaoClient } from "./client.ts"

const config = { apiKey: "private-kakao-key", requestTimeoutMs: 3_000 }

describe("KakaoClient", () => {
  it("searches for a place around a WGS84 coordinate with the REST key header", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe("/v2/local/search/keyword.json")
      expect(url.searchParams.get("query")).toBe("서울공예박물관")
      expect(url.searchParams.get("x")).toBe("126.9854")
      expect(new Headers(init?.headers).get("Authorization")).toBe("KakaoAK private-kakao-key")
      return new Response(
        JSON.stringify({
          documents: [
            {
              id: "123",
              place_name: "서울공예박물관",
              category_name: "문화,예술 > 박물관",
              category_group_code: "CT1",
              road_address_name: "서울 종로구 율곡로3길 4",
              address_name: "서울 종로구 안국동 175-2",
              x: "126.9838",
              y: "37.5767",
              place_url: "https://place.map.kakao.com/123",
              distance: "140",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })
    const places = await new KakaoClient(
      config,
      fetchImplementation as typeof fetch,
    ).searchKeyword("서울공예박물관", { lat: 37.5765, lng: 126.9854 })

    expect(places).toEqual([
      expect.objectContaining({
        id: "123",
        name: "서울공예박물관",
        location: { lat: 37.5767, lng: 126.9838 },
        distanceMeters: 140,
      }),
    ])
  })

  it("returns real per-leg walking distances, times, and the Kakao directions URL", async () => {
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      expect(url.pathname).toBe("/v2/routing/walk")
      expect(url.searchParams.get("via_x")).toBe("126.99")
      return new Response(
        JSON.stringify({
          status: "OK",
          route: {
            properties: {
              totalDistance: 1850,
              totalTime: 1501,
              landingUrl: "https://map.kakao.com/link/by/walk/example",
            },
            legs: [
              { properties: { distance: 750, time: 601 } },
              { properties: { distance: 1100, time: 900 } },
            ],
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })
    const route = await new KakaoClient(
      config,
      fetchImplementation as typeof fetch,
    ).walkingRoute([
      { lat: 37.57, lng: 126.98 },
      { lat: 37.575, lng: 126.99 },
      { lat: 37.58, lng: 127.0 },
    ])

    expect(route).toEqual({
      distanceMeters: 1850,
      durationMinutes: 26,
      directionsUrl: "https://map.kakao.com/link/by/walk/example",
      legs: [
        { distanceMeters: 750, durationMinutes: 11 },
        { distanceMeters: 1100, durationMinutes: 15 },
      ],
    })
  })
})
