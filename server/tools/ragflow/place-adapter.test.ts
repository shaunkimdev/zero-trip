import { describe, expect, it } from "vitest"

import {
  adaptRagflowPlaceChunks,
  adaptRagflowPlaceContent,
  adaptRagflowPlaceRecord,
  type CanonicalRagPlaceRecord,
  type RagflowRetrievedChunk,
} from "./place-adapter.ts"

const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const

function validRecord(
  overrides: Partial<CanonicalRagPlaceRecord> = {},
): CanonicalRagPlaceRecord {
  return {
    schema_version: "zero-trip.place.v2",
    id: "seoul-craft-museum",
    name: "서울공예박물관",
    cluster: "jongno",
    category: "museum",
    latitude: 37.5766,
    longitude: 126.9834,
    address: "서울 종로구 율곡로3길 4",
    summary: "전통과 현대 공예를 소개하는 박물관",
    recommended_visit_minutes: 70,
    price: {
      kind: "free",
      basis: "admission",
      adult_won: 0,
      youth_won: 0,
      child_won: 0,
      minimum_won: 0,
      maximum_won: 0,
      note: "상설 전시 무료",
    },
    opening_hours: Object.fromEntries(
      days.map((day) => [
        day,
        day === "mon"
          ? []
          : [{ open: "10:00", close: "18:00", last_admission_minutes_before_close: 30 }],
      ]),
    ) as unknown as CanonicalRagPlaceRecord["opening_hours"],
    event: null,
    tags: ["free", "exhibition", "culture", "indoor"],
    companions: ["solo", "couple", "children", "parents"],
    avoid_flags: ["waiting"],
    amenities: {
      wifi: { available: true, ssid: "SEOUL", location: "로비" },
      restroom: true,
      accessible: true,
      pet_friendly: false,
    },
    crowd_level: "medium",
    source: {
      name: "서울 열린데이터광장",
      url: "https://data.seoul.go.kr/",
      updated_at: "2026-08-29T09:30:00+09:00",
    },
    availability_note: "방문 전 휴관 여부 확인",
    ...overrides,
  }
}

function chunk(
  id: string,
  record: CanonicalRagPlaceRecord,
  similarity = 0.8,
): RagflowRetrievedChunk {
  return {
    id,
    documentId: `document-${id}`,
    datasetId: "seoul-places",
    content: JSON.stringify(record),
    similarity,
  }
}

describe("RAGFlow place record adapter", () => {
  it("parses fenced canonical JSON and maps snake_case fields to Place", () => {
    const record = validRecord()
    const result = adaptRagflowPlaceContent(`\`\`\`json\n${JSON.stringify(record)}\n\`\`\``)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.place).toMatchObject({
      id: record.id,
      location: { lat: record.latitude, lng: record.longitude },
      recommendedVisitMinutes: 70,
      price: {
        kind: "free",
        basis: "admission",
        adultWon: 0,
        youthWon: 0,
        childWon: 0,
        minimumWon: 0,
        maximumWon: 0,
      },
      openingHours: {
        mon: [],
        tue: [
          {
            open: "10:00",
            close: "18:00",
            lastAdmissionMinutesBeforeClose: 30,
          },
        ],
      },
      avoidFlags: ["waiting"],
      amenities: { petFriendly: false },
      crowdLevel: "medium",
      source: {
        name: "서울 열린데이터광장",
        updatedAt: "2026-08-29T09:30:00+09:00",
      },
      availabilityNote: "방문 전 휴관 여부 확인",
    })
  })

  it("accepts v2 restaurant ranges and rejects missing or inverted per-person ranges", () => {
    const restaurant = validRecord({
      id: "jongno-restaurant",
      name: "종로 식당",
      category: "restaurant",
      tags: ["food"],
      price: {
        kind: "paid",
        basis: "per-person",
        adult_won: null,
        youth_won: null,
        child_won: null,
        minimum_won: 8_000,
        maximum_won: 15_000,
        note: "1인 메뉴 가격대",
      },
    })
    const accepted = adaptRagflowPlaceRecord(restaurant)

    expect(accepted.ok).toBe(true)
    if (!accepted.ok) return
    expect(accepted.place).toMatchObject({
      category: "restaurant",
      price: {
        kind: "paid",
        basis: "per-person",
        adultWon: null,
        youthWon: null,
        childWon: null,
        minimumWon: 8_000,
        maximumWon: 15_000,
      },
    })

    const missingMaximum = {
      ...restaurant,
      price: { ...restaurant.price },
    } as Record<string, unknown>
    delete (missingMaximum.price as Record<string, unknown>).maximum_won
    const missingResult = adaptRagflowPlaceRecord(missingMaximum)
    expect(missingResult).toEqual({
      ok: false,
      reason: "price.maximum_won is required",
    })

    const invertedResult = adaptRagflowPlaceRecord(
      validRecord({
        ...restaurant,
        price: {
          ...restaurant.price,
          minimum_won: 16_000,
          maximum_won: 15_000,
        },
      }),
    )
    expect(invertedResult).toEqual({
      ok: false,
      reason: "price.minimum_won must not exceed price.maximum_won",
    })
  })

  it("rejects malformed JSON and a missing price instead of inferring free admission", () => {
    const missingPrice = { ...validRecord() } as Record<string, unknown>
    delete missingPrice.price

    const result = adaptRagflowPlaceChunks([
      { id: "malformed", content: "{not-json", similarity: 0.9 },
      { id: "missing-price", content: JSON.stringify(missingPrice), similarity: 0.8 },
    ])

    expect(result.accepted).toHaveLength(0)
    expect(result.rejectedCount).toBe(2)
    expect(result.rejections.map(({ reason }) => reason).join(" ")).toMatch(/valid JSON object/)
    expect(result.rejections.map(({ reason }) => reason).join(" ")).toMatch(/record\.price is required/)

    const direct = adaptRagflowPlaceRecord(missingPrice)
    expect(direct).toEqual({ ok: false, reason: "record.price is required" })
  })

  it("rejects coordinates outside Seoul and invalid opening-hour windows independently", () => {
    const invalidHours = validRecord({
      id: "invalid-hours",
      opening_hours: {
        ...validRecord().opening_hours,
        tue: [{ open: "9:00", close: "08:00" }],
      },
    })
    const result = adaptRagflowPlaceChunks([
      chunk("outside-seoul", validRecord({ id: "outside", latitude: 35.1796 })),
      chunk(
        "inside-box-outside-boundary",
        validRecord({ id: "goyang", latitude: 37.69, longitude: 126.83 }),
      ),
      chunk("bad-hours", invalidHours),
      chunk("still-valid", validRecord({ id: "valid-place" })),
    ])

    expect(result.accepted.map(({ place }) => place.id)).toEqual(["valid-place"])
    expect(result.rejectedCount).toBe(3)
    expect(result.rejections.find(({ chunkId }) => chunkId === "outside-seoul")?.reason).toMatch(
      /within Seoul/,
    )
    expect(result.rejections.find(({ chunkId }) => chunkId === "bad-hours")?.reason).toMatch(
      /HH:mm/,
    )
    expect(
      result.rejections.find(({ chunkId }) => chunkId === "inside-box-outside-boundary")
        ?.reason,
    ).toMatch(/district cluster/)
  })

  it("deduplicates place IDs by newest source date, then highest similarity", () => {
    const oldHighSimilarity = chunk(
      "old-high",
      validRecord({
        source: {
          name: "old",
          url: "https://data.seoul.go.kr/old",
          updated_at: "2026-08-20",
        },
      }),
      0.99,
    )
    const newestLowSimilarity = chunk(
      "new-low",
      validRecord({
        source: {
          name: "new low",
          url: "https://data.seoul.go.kr/new-low",
          updated_at: "2026-08-29",
        },
      }),
      0.7,
    )
    const newestHighSimilarity = chunk(
      "new-high",
      validRecord({
        source: {
          name: "new high",
          url: "https://data.seoul.go.kr/new-high",
          updated_at: "2026-08-29",
        },
      }),
      0.91,
    )
    const otherPlace = chunk("other", validRecord({ id: "other-place" }), 0.5)

    const result = adaptRagflowPlaceChunks([
      oldHighSimilarity,
      newestLowSimilarity,
      newestHighSimilarity,
      otherPlace,
    ])

    expect(result.accepted).toHaveLength(2)
    expect(result.accepted.find(({ place }) => place.id === "seoul-craft-museum")).toMatchObject({
      chunkId: "new-high",
      similarity: 0.91,
      place: { source: { name: "new high", updatedAt: "2026-08-29" } },
    })
    expect(result.rejectedCount).toBe(2)
    expect(result.rejections.every(({ reason }) => reason.includes("duplicate place id"))).toBe(true)
  })
})
