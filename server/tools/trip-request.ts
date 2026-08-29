import {
  AVOIDANCES,
  COMPANIONS,
  INTERESTS,
  type Avoidance,
  type Companion,
  type Interest,
  type TripRequest,
} from "../../src/types/trip.ts"

const companions = new Set<string>(COMPANIONS)
const interests = new Set<string>(INTERESTS)
const avoidances = new Set<string>(AVOIDANCES)

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("요청 본문은 JSON 객체여야 합니다.")
  }
  return value as Record<string, unknown>
}

function finiteNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label}은(는) 숫자여야 합니다.`)
  }
  if (value < minimum || value > maximum) {
    throw new RangeError(`${label}의 허용 범위를 벗어났습니다.`)
  }
  return value
}

function enumArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  label: string,
): T[] {
  if (!Array.isArray(value) || value.length > 20) {
    throw new TypeError(`${label}은(는) 배열이어야 합니다.`)
  }
  if (!value.every((item) => typeof item === "string" && allowed.has(item))) {
    throw new RangeError(`${label}에 지원하지 않는 값이 있습니다.`)
  }
  return [...new Set(value)] as T[]
}

function time(value: unknown, label: string) {
  if (typeof value !== "string" || !/^([01]?\d|2[0-4]):[0-5]\d$/.test(value)) {
    throw new TypeError(`${label}은(는) HH:mm 형식이어야 합니다.`)
  }
  if (value.startsWith("24:") && value !== "24:00") {
    throw new RangeError(`${label}이(가) 올바르지 않습니다.`)
  }
  return value
}

export function parseTripRequest(payload: unknown): TripRequest {
  const wrapper = object(payload)
  const row = object("request" in wrapper ? wrapper.request : wrapper)
  const origin = object(row.origin)
  const companion = row.companion
  const date = row.date
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError("date는 YYYY-MM-DD 형식이어야 합니다.")
  }
  if (typeof companion !== "string" || !companions.has(companion)) {
    throw new RangeError("지원하지 않는 동행 유형입니다.")
  }

  const partySize = row.partySize === undefined
    ? 1
    : finiteNumber(row.partySize, "partySize", 1, 20)
  const variant = row.variant === undefined
    ? 0
    : finiteNumber(row.variant, "variant", 0, 1_000_000)
  if (!Number.isInteger(partySize) || !Number.isInteger(variant)) {
    throw new RangeError("partySize와 variant는 정수여야 합니다.")
  }

  return {
    origin: {
      lat: finiteNumber(origin.lat, "origin.lat", -90, 90),
      lng: finiteNumber(origin.lng, "origin.lng", -180, 180),
      ...(typeof origin.label === "string" && origin.label.trim()
        ? { label: origin.label.trim().slice(0, 100) }
        : {}),
    },
    date,
    startTime: time(row.startTime, "startTime"),
    endTime: time(row.endTime, "endTime"),
    budgetWon: finiteNumber(row.budgetWon, "budgetWon", 0, 10_000_000),
    maxWalkingKm: finiteNumber(row.maxWalkingKm, "maxWalkingKm", 0, 100),
    companion: companion as Companion,
    wants: enumArray<Interest>(row.wants, interests, "wants"),
    avoids: enumArray<Avoidance>(row.avoids, avoidances, "avoids"),
    partySize,
    variant,
  }
}
