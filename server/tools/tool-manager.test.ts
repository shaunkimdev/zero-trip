import { afterEach, describe, expect, it, vi } from "vitest"

import { seoulPlaces } from "../../src/data/seoul-places.ts"
import type { Place, TripRequest } from "../../src/types/trip.ts"
import { loadToolConfig } from "./shared/config.ts"
import { ZeroTripToolManager } from "./tool-manager.ts"

const request: TripRequest = {
  origin: { lat: 37.5765, lng: 126.9854, label: "안국역" },
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

function configuredManager() {
  return new ZeroTripToolManager(
    loadToolConfig({
      RAGFLOW_BASE_URL: "https://ragflow.example.com",
      RAGFLOW_API_KEY: "rag-secret",
      RAGFLOW_DATASET_IDS: "seoul-places",
      RAGFLOW_ALLOWED_SOURCE_HOSTS: "data.seoul.go.kr",
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

  it("uses a visibly labelled demo plan only when RAGFlow is unconfigured", async () => {
    const plan = await new ZeroTripToolManager(loadToolConfig({})).planTrip(request)

    expect(plan.stops.length).toBeGreaterThan(0)
    expect(plan.grounding).toMatchObject({ mode: "demo", provider: expect.stringContaining("데모") })
  })
})
