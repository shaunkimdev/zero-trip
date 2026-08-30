import { describe, expect, it, vi } from "vitest"

import { TourApiClient } from "./client.ts"

describe("TourApiClient", () => {
  it("requests and validates nearby official tourism records", async () => {
    let requestedUrl: URL | undefined
    let now = 1_000
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input))
      requestedUrl = url
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "0000", resultMsg: "OK" },
            body: {
              items: {
                item: {
                  contentid: "123",
                  contenttypeid: "14",
                  title: "서울공예박물관",
                  addr1: "서울 종로구 율곡로3길 4",
                  mapx: "126.9838",
                  mapy: "37.5767",
                  modifiedtime: "20260829153000",
                },
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })
    const client = new TourApiClient(
      { serviceKey: "tour%2Bkey%3D%3D", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
      () => now,
    )

    const places = await client.nearbyPlaces({ lat: 37.5765, lng: 126.9854 })

    expect(requestedUrl?.pathname).toMatch(/\/KorService2\/locationBasedList2$/)
    expect(requestedUrl?.searchParams.get("serviceKey")).toBe("tour+key==")
    expect(requestedUrl?.searchParams.get("mapX")).toBe("126.9854")
    expect(requestedUrl?.searchParams.get("mapY")).toBe("37.5765")
    expect(requestedUrl?.searchParams.get("_type")).toBe("json")
    expect(places).toEqual([
      {
        contentId: "123",
        contentTypeId: "14",
        title: "서울공예박물관",
        address: "서울 종로구 율곡로3길 4",
        location: { lat: 37.5767, lng: 126.9838 },
        modifiedAt: "2026-08-29T15:30:00+09:00",
      },
    ])
    await client.nearbyPlaces({ lat: 37.5765, lng: 126.9854 })
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
    now += 16 * 60 * 1_000
    await client.nearbyPlaces({ lat: 37.5765, lng: 126.9854 })
    expect(fetchImplementation).toHaveBeenCalledTimes(2)
  })

  it("searches Seoul tourism records by place name", async () => {
    let requestedUrl: URL | undefined
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = new URL(String(input))
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "0000", resultMsg: "OK" },
            body: {
              items: {
                item: {
                  contentid: "126827",
                  contenttypeid: "12",
                  title: "국회의사당",
                  addr1: "서울 영등포구 의사당대로 1",
                  mapx: "126.9142",
                  mapy: "37.5327",
                },
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })
    const client = new TourApiClient(
      { serviceKey: "tour-key", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
    )

    const places = await client.searchPlaces("국회의사당", 5)

    expect(requestedUrl?.pathname).toMatch(/\/KorService2\/searchKeyword2$/)
    expect(requestedUrl?.searchParams.get("keyword")).toBe("국회의사당")
    expect(requestedUrl?.searchParams.get("areaCode")).toBe("1")
    expect(places[0]).toMatchObject({ contentId: "126827", title: "국회의사당" })
  })

  it("returns three deduplicated rights-cleared representative images", async () => {
    let requestedUrl: URL | undefined
    const fetchImplementation = vi.fn(async (input: string | URL | Request) => {
      requestedUrl = new URL(String(input))
      return new Response(
        JSON.stringify({
          response: {
            header: { resultCode: "0000", resultMsg: "OK" },
            body: {
              items: {
                item: [
                  {
                    contentid: "126827",
                    originimgurl: "http://tong.visitkorea.or.kr/photo-1.jpg",
                    smallimageurl: "http://tong.visitkorea.or.kr/thumb-1.jpg",
                    imgname: "국회의사당 전경",
                  },
                  {
                    contentid: "126827",
                    originimgurl: "https://tong.visitkorea.or.kr/photo-2.jpg",
                    smallimageurl: "https://tong.visitkorea.or.kr/thumb-2.jpg",
                    imgname: "국회의사당 내부",
                  },
                  {
                    contentid: "126827",
                    originimgurl: "https://tong.visitkorea.or.kr/photo-3.jpg",
                    smallimageurl: "https://tong.visitkorea.or.kr/thumb-3.jpg",
                    imgname: "국회의사당 전시",
                  },
                  {
                    contentid: "different-place",
                    originimgurl: "https://tong.visitkorea.or.kr/wrong-place.jpg",
                    imgname: "다른 관광지 사진",
                  },
                  {
                    contentid: "126827",
                    originimgurl: "http://tong.visitkorea.or.kr/photo-1.jpg",
                    imgname: "중복 이미지",
                  },
                ],
              },
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      )
    })
    const client = new TourApiClient(
      { serviceKey: "tour-key", requestTimeoutMs: 3_000 },
      fetchImplementation as typeof fetch,
    )

    const images = await client.placeImages("126827", 3)

    expect(requestedUrl?.pathname).toMatch(/\/KorService2\/detailImage2$/)
    expect(requestedUrl?.searchParams.get("contentId")).toBe("126827")
    expect(requestedUrl?.searchParams.get("imageYN")).toBe("Y")
    expect(requestedUrl?.searchParams.has("subImageYN")).toBe(false)
    expect(images).toEqual([
      {
        url: "https://tong.visitkorea.or.kr/photo-1.jpg",
        thumbnailUrl: "https://tong.visitkorea.or.kr/thumb-1.jpg",
        alt: "국회의사당 전경",
      },
      {
        url: "https://tong.visitkorea.or.kr/photo-2.jpg",
        thumbnailUrl: "https://tong.visitkorea.or.kr/thumb-2.jpg",
        alt: "국회의사당 내부",
      },
      {
        url: "https://tong.visitkorea.or.kr/photo-3.jpg",
        thumbnailUrl: "https://tong.visitkorea.or.kr/thumb-3.jpg",
        alt: "국회의사당 전시",
      },
    ])
    await client.placeImages("126827", 3)
    expect(fetchImplementation).toHaveBeenCalledTimes(1)
  })
})
