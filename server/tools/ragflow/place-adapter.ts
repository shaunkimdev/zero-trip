import {
  AVOIDANCES,
  COMPANIONS,
  INTERESTS,
  PLACE_CLUSTERS,
  PLACE_CATEGORIES,
  type Avoidance,
  type Companion,
  type EventSchedule,
  type Place,
  type PlaceAmenities,
  type PlaceCategory,
  type PlaceCluster,
  type PlacePrice,
  type PlaceTag,
  type TimeWindow,
  type Weekday,
  type WeeklyOpeningHours,
} from "../../../src/types/trip.ts"

const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const
const CROWD_LEVELS = ["low", "medium", "high"] as const
const PRICE_KINDS = ["free", "paid", "unknown"] as const
const PRICE_BASES = ["admission", "per-person"] as const
const EXTRA_PLACE_TAGS = [
  "art",
  "history",
  "architecture",
  "indoor",
  "outdoor",
  "quiet",
  "river",
  "garden",
  "library",
  "family",
  "accessible",
  "pet-friendly",
] as const

const weekdaySet = new Set<string>(WEEKDAYS)
const clusterSet = new Set<string>(PLACE_CLUSTERS)
const categorySet = new Set<string>(PLACE_CATEGORIES)
const crowdLevelSet = new Set<string>(CROWD_LEVELS)
const priceKindSet = new Set<string>(PRICE_KINDS)
const priceBasisSet = new Set<string>(PRICE_BASES)
const companionSet = new Set<string>(COMPANIONS)
const avoidanceSet = new Set<string>(AVOIDANCES)
const placeTagSet = new Set<string>([...INTERESTS, ...EXTRA_PLACE_TAGS])

/**
 * Bounding box of the bundled Seoul district geometry, with a small tolerance
 * for entrance coordinates that sit just outside an administrative polygon.
 */
export const SEOUL_COORDINATE_BOUNDS = {
  minLat: 37.4,
  maxLat: 37.72,
  minLng: 126.74,
  maxLng: 127.21,
} as const

type DistrictBounds = readonly [minLat: number, maxLat: number, minLng: number, maxLng: number]

const DISTRICT_BOUNDS: Record<PlaceCluster, DistrictBounds> = {
  gangdong: [37.514157, 37.577914, 127.111676, 127.185434],
  songpa: [37.462404, 37.54067, 127.068604, 127.163494],
  gangnam: [37.455784, 37.536064, 127.013971, 127.124414],
  seocho: [37.425749, 37.52504, 126.982238, 127.098428],
  gwanak: [37.433151, 37.492184, 126.901561, 126.990721],
  dongjak: [37.472561, 37.517225, 126.90532, 126.987179],
  yeongdeungpo: [37.482181, 37.547374, 126.881564, 126.9525],
  geumcheon: [37.43101, 37.483783, 126.875538, 126.930844],
  guro: [37.471467, 37.51397, 126.814807, 126.90532],
  gangseo: [37.523737, 37.601857, 126.767005, 126.891847],
  yangcheon: [37.499654, 37.548592, 126.823899, 126.893617],
  mapo: [37.526618, 37.588143, 126.859504, 126.966042],
  seodaemun: [37.55231, 37.605087, 126.903701, 126.971692],
  eunpyeong: [37.573124, 37.656146, 126.884333, 126.973886],
  nowon: [37.61136, 37.693602, 127.043588, 127.114497],
  dobong: [37.628489, 37.698589, 127.01018, 127.058001],
  gangbuk: [37.606347, 37.682285, 126.981745, 127.052094],
  seongbuk: [37.575246, 37.633776, 126.977175, 127.073827],
  jungnang: [37.566762, 37.618042, 127.071528, 127.120481],
  dongdaemun: [37.557248, 37.606543, 127.025273, 127.080685],
  gwangjin: [37.520773, 37.570763, 127.058674, 127.116009],
  seongdong: [37.5263, 37.570225, 127.01044, 127.075807],
  yongsan: [37.509315, 37.552184, 126.945667, 127.023028],
  jung: [37.541011, 37.568944, 126.963582, 127.02881],
  jongno: [37.563136, 37.629496, 126.951454, 127.025473],
  seongsu: [37.5263, 37.570225, 127.01044, 127.075807],
  "yeouido-mapo": [37.482181, 37.588143, 126.859504, 126.966042],
}

export const CANONICAL_PLACE_SCHEMA_VERSION = "zero-trip.place.v2" as const

/**
 * Canonical JSON record stored in and retrieved from RAGFlow.
 *
 * The wire format deliberately uses snake_case. The adapter below is the only
 * place where it is converted to the application's camelCase `Place` model.
 */
export interface CanonicalRagPlaceRecord {
  schema_version: typeof CANONICAL_PLACE_SCHEMA_VERSION
  id: string
  name: string
  cluster: PlaceCluster
  category: PlaceCategory
  latitude: number
  longitude: number
  address: string
  summary: string
  recommended_visit_minutes: number
  price: {
    kind: PlacePrice["kind"]
    basis: PlacePrice["basis"]
    adult_won: number | null
    youth_won: number | null
    child_won: number | null
    minimum_won: number | null
    maximum_won: number | null
    note?: string | null
  }
  opening_hours: Record<
    Weekday,
    readonly {
      open: string
      close: string
      last_admission_minutes_before_close?: number | null
    }[]
  >
  event?: {
    start_date: string
    end_date: string
    fixed_start_time?: string | null
    requires_reservation?: boolean
  } | null
  tags: readonly PlaceTag[]
  companions: readonly Companion[]
  avoid_flags: readonly Avoidance[]
  amenities: {
    wifi: {
      available: boolean
      ssid?: string | null
      location?: string | null
    }
    restroom: boolean
    accessible: boolean | "unknown"
    pet_friendly: boolean | "unknown"
  }
  crowd_level: Place["crowdLevel"]
  source: {
    name: string
    url: string
    updated_at: string
  }
  availability_note?: string | null
}

export interface RagflowRetrievedChunk {
  id: string
  documentId?: string
  datasetId?: string
  content: string
  similarity: number
}

export interface RagflowPlaceEvidence {
  place: Place
  chunkId: string
  documentId?: string
  datasetId?: string
  similarity: number
}

export interface RagflowPlaceRejection {
  chunkId: string
  documentId?: string
  datasetId?: string
  reason: string
}

export interface RagflowPlaceAdapterResult {
  accepted: readonly RagflowPlaceEvidence[]
  rejectedCount: number
  rejections: readonly RagflowPlaceRejection[]
}

export type RagflowPlaceRecordResult =
  | { ok: true; place: Place }
  | { ok: false; reason: string }

class PlaceRecordValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PlaceRecordValidationError"
  }
}

function invalid(message: string): never {
  throw new PlaceRecordValidationError(message)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function recordValue(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) invalid(`${path} must be an object`)
  return value
}

function requiredField(record: Record<string, unknown>, key: string, path: string): unknown {
  if (!Object.hasOwn(record, key)) invalid(`${path}.${key} is required`)
  return record[key]
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${path} must be a non-empty string`)
  }
  return value.trim()
}

function optionalString(value: unknown, path: string): string | undefined {
  if (value === undefined || value === null) return undefined
  return requiredString(value, path)
}

function finiteNumber(value: unknown, path: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    invalid(`${path} must be a finite number`)
  }
  return value
}

function nonnegativeInteger(value: unknown, path: string): number {
  const number = finiteNumber(value, path)
  if (!Number.isInteger(number) || number < 0) {
    invalid(`${path} must be a nonnegative integer`)
  }
  return number
}

function positiveInteger(value: unknown, path: string): number {
  const number = nonnegativeInteger(value, path)
  if (number === 0) invalid(`${path} must be greater than zero`)
  return number
}

function booleanValue(value: unknown, path: string): boolean {
  if (typeof value !== "boolean") invalid(`${path} must be a boolean`)
  return value
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  path: string,
): T {
  if (typeof value !== "string" || !allowed.has(value)) {
    invalid(`${path} contains an unsupported value`)
  }
  return value as T
}

function enumArray<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
  path: string,
  options: { allowEmpty?: boolean } = {},
): T[] {
  if (!Array.isArray(value)) invalid(`${path} must be an array`)
  if (!options.allowEmpty && value.length === 0) invalid(`${path} must not be empty`)

  const parsed = value.map((item, index) => enumValue<T>(item, allowed, `${path}[${index}]`))
  if (new Set(parsed).size !== parsed.length) invalid(`${path} must not contain duplicates`)
  return parsed
}

function parseIsoDate(value: unknown, path: string): string {
  const date = requiredString(value, path)
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) invalid(`${path} must be an ISO date (YYYY-MM-DD)`)

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const probe = new Date(Date.UTC(year, month - 1, day))
  if (
    probe.getUTCFullYear() !== year ||
    probe.getUTCMonth() !== month - 1 ||
    probe.getUTCDate() !== day
  ) {
    invalid(`${path} must be a valid ISO date`)
  }
  return date
}

function parseIsoUpdatedAt(value: unknown, path: string): string {
  const timestamp = requiredString(value, path)
  if (/^\d{4}-\d{2}-\d{2}$/.test(timestamp)) return parseIsoDate(timestamp, path)

  const rfc3339 =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/
  if (!rfc3339.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    invalid(`${path} must be an ISO 8601 timestamp`)
  }
  return timestamp
}

function parseUrl(value: unknown, path: string): string | undefined {
  const url = optionalString(value, path)
  if (url === undefined) return undefined

  try {
    const parsed = new URL(url)
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      invalid(`${path} must use http or https`)
    }
  } catch (error) {
    if (error instanceof PlaceRecordValidationError) throw error
    invalid(`${path} must be a valid URL`)
  }
  return url
}

function timeToMinute(value: unknown, path: string, allowEndOfDay = false): number {
  const time = requiredString(value, path)
  const match = /^(\d{2}):(\d{2})$/.exec(time)
  if (!match) invalid(`${path} must use HH:mm format`)

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours === 24 && minutes === 0 && allowEndOfDay) return 24 * 60
  if (hours > 23 || minutes > 59) invalid(`${path} is not a valid time`)
  return hours * 60 + minutes
}

function parsePrice(value: unknown, category: PlaceCategory): PlacePrice {
  const price = recordValue(value, "price")
  const kind = enumValue<PlacePrice["kind"]>(
    requiredField(price, "kind", "price"),
    priceKindSet,
    "price.kind",
  )
  const basis = enumValue<PlacePrice["basis"]>(
    requiredField(price, "basis", "price"),
    priceBasisSet,
    "price.basis",
  )

  const parseAmount = (
    key: "adult_won" | "youth_won" | "child_won" | "minimum_won" | "maximum_won",
  ) => {
    const amount = requiredField(price, key, "price")
    return amount === null ? null : nonnegativeInteger(amount, `price.${key}`)
  }
  const adultWon = parseAmount("adult_won")
  const youthWon = parseAmount("youth_won")
  const childWon = parseAmount("child_won")
  const minimumWon = parseAmount("minimum_won")
  const maximumWon = parseAmount("maximum_won")
  const amounts = [adultWon, youthWon, childWon, minimumWon, maximumWon]

  if (kind === "free" && amounts.some((amount) => amount !== 0)) {
    invalid("price.free records must explicitly set every price to 0")
  }
  if (kind === "unknown" && amounts.some((amount) => amount !== null)) {
    invalid("price.unknown records must explicitly set every price to null")
  }
  if (kind === "paid" && basis === "admission") {
    if (adultWon === null) invalid("price.adult_won is required for paid admission records")
    if (minimumWon !== null || maximumWon !== null) {
      invalid("paid admission records must set price range fields to null")
    }
  }
  if (kind === "paid" && basis === "per-person") {
    if ([adultWon, youthWon, childWon].some((amount) => amount !== null)) {
      invalid("paid per-person records must set age-specific prices to null")
    }
    if (minimumWon === null || maximumWon === null) {
      invalid("paid per-person records require minimum_won and maximum_won")
    }
    if (minimumWon > maximumWon) {
      invalid("price.minimum_won must not exceed price.maximum_won")
    }
  }
  if ((category === "cafe" || category === "restaurant") && basis !== "per-person") {
    invalid(`${category} records must use per-person pricing`)
  }

  return {
    kind,
    basis,
    adultWon,
    youthWon,
    childWon,
    minimumWon,
    maximumWon,
    ...withOptional("note", optionalString(price.note, "price.note")),
  }
}

function parseOpeningHours(value: unknown): WeeklyOpeningHours {
  const source = recordValue(value, "opening_hours")
  const unexpectedDays = Object.keys(source).filter((day) => !weekdaySet.has(day))
  if (unexpectedDays.length > 0) {
    invalid(`opening_hours contains unsupported day: ${unexpectedDays[0]}`)
  }

  const result = {} as Record<Weekday, TimeWindow[]>
  for (const weekday of WEEKDAYS) {
    const windows = requiredField(source, weekday, "opening_hours")
    if (!Array.isArray(windows)) invalid(`opening_hours.${weekday} must be an array`)

    let previousClose = -1
    result[weekday] = windows.map((windowValue, index) => {
      const path = `opening_hours.${weekday}[${index}]`
      const window = recordValue(windowValue, path)
      const open = requiredString(requiredField(window, "open", path), `${path}.open`)
      const close = requiredString(requiredField(window, "close", path), `${path}.close`)
      const openMinute = timeToMinute(open, `${path}.open`)
      const closeMinute = timeToMinute(close, `${path}.close`, true)
      if (closeMinute <= openMinute) invalid(`${path}.close must be later than open`)
      if (openMinute < previousClose) invalid(`opening_hours.${weekday} windows must not overlap`)
      previousClose = closeMinute

      const lastAdmissionRaw = window.last_admission_minutes_before_close
      const lastAdmission =
        lastAdmissionRaw === undefined || lastAdmissionRaw === null
          ? undefined
          : nonnegativeInteger(
              lastAdmissionRaw,
              `${path}.last_admission_minutes_before_close`,
            )
      if (lastAdmission !== undefined && lastAdmission > closeMinute - openMinute) {
        invalid(`${path}.last_admission_minutes_before_close exceeds the opening window`)
      }

      return {
        open,
        close,
        ...withOptional("lastAdmissionMinutesBeforeClose", lastAdmission),
      }
    })
  }
  return result
}

function parseEvent(value: unknown): EventSchedule | undefined {
  if (value === undefined || value === null) return undefined
  const event = recordValue(value, "event")
  const startDate = parseIsoDate(requiredField(event, "start_date", "event"), "event.start_date")
  const endDate = parseIsoDate(requiredField(event, "end_date", "event"), "event.end_date")
  if (endDate < startDate) invalid("event.end_date must not be earlier than event.start_date")

  const fixedStartTime = optionalString(event.fixed_start_time, "event.fixed_start_time")
  if (fixedStartTime !== undefined) {
    timeToMinute(fixedStartTime, "event.fixed_start_time")
  }
  const requiresReservation =
    event.requires_reservation === undefined
      ? undefined
      : booleanValue(event.requires_reservation, "event.requires_reservation")

  return {
    startDate,
    endDate,
    ...withOptional("fixedStartTime", fixedStartTime),
    ...withOptional("requiresReservation", requiresReservation),
  }
}

function parseAmenities(value: unknown): PlaceAmenities {
  const amenities = recordValue(value, "amenities")
  const wifi = recordValue(requiredField(amenities, "wifi", "amenities"), "amenities.wifi")
  const accessible = requiredField(amenities, "accessible", "amenities")
  const petFriendly = requiredField(amenities, "pet_friendly", "amenities")

  const triState = (state: unknown, path: string): boolean | "unknown" => {
    if (state === "unknown") return state
    return booleanValue(state, path)
  }

  return {
    wifi: {
      available: booleanValue(
        requiredField(wifi, "available", "amenities.wifi"),
        "amenities.wifi.available",
      ),
      ...withOptional("ssid", optionalString(wifi.ssid, "amenities.wifi.ssid")),
      ...withOptional("location", optionalString(wifi.location, "amenities.wifi.location")),
    },
    restroom: booleanValue(
      requiredField(amenities, "restroom", "amenities"),
      "amenities.restroom",
    ),
    accessible: triState(accessible, "amenities.accessible"),
    petFriendly: triState(petFriendly, "amenities.pet_friendly"),
  }
}

function withOptional<Key extends string, Value>(
  key: Key,
  value: Value | undefined,
): Partial<Record<Key, Value>> {
  return value === undefined ? {} : ({ [key]: value } as Record<Key, Value>)
}

function adaptRecord(value: unknown): Place {
  const record = recordValue(value, "record")
  const schemaVersion = requiredString(
    requiredField(record, "schema_version", "record"),
    "record.schema_version",
  )
  if (schemaVersion !== CANONICAL_PLACE_SCHEMA_VERSION) {
    invalid(`record.schema_version must be ${CANONICAL_PLACE_SCHEMA_VERSION}`)
  }
  const cluster = enumValue<PlaceCluster>(
    requiredField(record, "cluster", "record"),
    clusterSet,
    "record.cluster",
  )
  const latitude = finiteNumber(requiredField(record, "latitude", "record"), "record.latitude")
  const longitude = finiteNumber(
    requiredField(record, "longitude", "record"),
    "record.longitude",
  )
  if (
    latitude < SEOUL_COORDINATE_BOUNDS.minLat ||
    latitude > SEOUL_COORDINATE_BOUNDS.maxLat ||
    longitude < SEOUL_COORDINATE_BOUNDS.minLng ||
    longitude > SEOUL_COORDINATE_BOUNDS.maxLng
  ) {
    invalid("record coordinates must fall within Seoul")
  }
  const [minLat, maxLat, minLng, maxLng] = DISTRICT_BOUNDS[cluster]
  const tolerance = 0.002
  if (
    latitude < minLat - tolerance ||
    latitude > maxLat + tolerance ||
    longitude < minLng - tolerance ||
    longitude > maxLng + tolerance
  ) {
    invalid("record coordinates must match the declared Seoul district cluster")
  }

  const sourceRecord = recordValue(requiredField(record, "source", "record"), "source")
  const sourceUrl = parseUrl(
    requiredField(sourceRecord, "url", "source"),
    "source.url",
  )
  if (!sourceUrl) invalid("source.url is required")
  const event = parseEvent(record.event)
  const availabilityNote = optionalString(record.availability_note, "record.availability_note")
  const category = enumValue<PlaceCategory>(
    requiredField(record, "category", "record"),
    categorySet,
    "record.category",
  )

  return {
    id: requiredString(requiredField(record, "id", "record"), "record.id"),
    name: requiredString(requiredField(record, "name", "record"), "record.name"),
    cluster,
    category,
    location: { lat: latitude, lng: longitude },
    address: requiredString(requiredField(record, "address", "record"), "record.address"),
    summary: requiredString(requiredField(record, "summary", "record"), "record.summary"),
    recommendedVisitMinutes: positiveInteger(
      requiredField(record, "recommended_visit_minutes", "record"),
      "record.recommended_visit_minutes",
    ),
    price: parsePrice(requiredField(record, "price", "record"), category),
    openingHours: parseOpeningHours(requiredField(record, "opening_hours", "record")),
    ...withOptional("event", event),
    tags: enumArray<PlaceTag>(requiredField(record, "tags", "record"), placeTagSet, "record.tags", {
      allowEmpty: true,
    }),
    companions: enumArray<Companion>(
      requiredField(record, "companions", "record"),
      companionSet,
      "record.companions",
    ),
    avoidFlags: enumArray<Avoidance>(
      requiredField(record, "avoid_flags", "record"),
      avoidanceSet,
      "record.avoid_flags",
      { allowEmpty: true },
    ),
    amenities: parseAmenities(requiredField(record, "amenities", "record")),
    crowdLevel: enumValue<Place["crowdLevel"]>(
      requiredField(record, "crowd_level", "record"),
      crowdLevelSet,
      "record.crowd_level",
    ),
    source: {
      name: requiredString(requiredField(sourceRecord, "name", "source"), "source.name"),
      url: sourceUrl,
      updatedAt: parseIsoUpdatedAt(
        requiredField(sourceRecord, "updated_at", "source"),
        "source.updated_at",
      ),
    },
    ...withOptional("availabilityNote", availabilityNote),
  }
}

/** Safely validates and converts one already-parsed canonical record. */
export function adaptRagflowPlaceRecord(value: unknown): RagflowPlaceRecordResult {
  try {
    return { ok: true, place: adaptRecord(value) }
  } catch (error) {
    return {
      ok: false,
      reason:
        error instanceof PlaceRecordValidationError
          ? error.message
          : "record could not be validated",
    }
  }
}

function jsonPayload(content: string): string {
  const trimmed = content.trim()
  const fenced = /^```(?:json)?[ \t]*\r?\n?([\s\S]*?)\r?\n?```$/i.exec(trimmed)
  return (fenced?.[1] ?? trimmed).trim()
}

/** Safely parses raw JSON or a single JSON Markdown fence, then adapts it. */
export function adaptRagflowPlaceContent(content: string): RagflowPlaceRecordResult {
  if (typeof content !== "string" || content.trim().length === 0) {
    return { ok: false, reason: "chunk content must be a non-empty JSON string" }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonPayload(content))
  } catch {
    return { ok: false, reason: "chunk content must contain one valid JSON object" }
  }
  if (!isRecord(parsed)) {
    return { ok: false, reason: "chunk content must contain one JSON object" }
  }
  return adaptRagflowPlaceRecord(parsed)
}

function chunkIdentity(value: unknown, index: number) {
  if (!isRecord(value)) {
    return { chunkId: `chunk-${index}`, documentId: undefined, datasetId: undefined }
  }
  const chunkId =
    typeof value.id === "string" && value.id.trim().length > 0
      ? value.id.trim()
      : `chunk-${index}`
  const documentId =
    typeof value.documentId === "string" && value.documentId.trim().length > 0
      ? value.documentId.trim()
      : undefined
  const datasetId =
    typeof value.datasetId === "string" && value.datasetId.trim().length > 0
      ? value.datasetId.trim()
      : undefined
  return { chunkId, documentId, datasetId }
}

function preferredEvidence(
  candidate: RagflowPlaceEvidence,
  current: RagflowPlaceEvidence,
): boolean {
  const candidateUpdatedAt = Date.parse(candidate.place.source.updatedAt)
  const currentUpdatedAt = Date.parse(current.place.source.updatedAt)
  if (candidateUpdatedAt !== currentUpdatedAt) return candidateUpdatedAt > currentUpdatedAt
  if (candidate.similarity !== current.similarity) return candidate.similarity > current.similarity
  return candidate.chunkId.localeCompare(current.chunkId) < 0
}

/**
 * Adapts a retrieval response without failing the whole response for one bad
 * chunk. Duplicate place IDs retain the newest record; equal timestamps use
 * similarity and then chunk ID as deterministic tie-breakers.
 */
export function adaptRagflowPlaceChunks(
  chunks: readonly RagflowRetrievedChunk[],
): RagflowPlaceAdapterResult {
  const selected = new Map<string, RagflowPlaceEvidence>()
  const rejections: RagflowPlaceRejection[] = []

  chunks.forEach((chunk, index) => {
    const { chunkId, documentId, datasetId } = chunkIdentity(chunk, index)

    try {
      if (!isRecord(chunk)) invalid("chunk must be an object")
      if (typeof chunk.id !== "string" || chunk.id.trim().length === 0) {
        invalid("chunk.id must be a non-empty string")
      }
      if (
        chunk.documentId !== undefined &&
        (typeof chunk.documentId !== "string" || chunk.documentId.trim().length === 0)
      ) {
        invalid("chunk.documentId must be a non-empty string when provided")
      }
      if (
        chunk.datasetId !== undefined &&
        (typeof chunk.datasetId !== "string" || chunk.datasetId.trim().length === 0)
      ) {
        invalid("chunk.datasetId must be a non-empty string when provided")
      }
      if (typeof chunk.similarity !== "number" || !Number.isFinite(chunk.similarity)) {
        invalid("chunk.similarity must be a finite number")
      }

      const adapted = adaptRagflowPlaceContent(chunk.content)
      if (!adapted.ok) invalid(adapted.reason)

      const evidence: RagflowPlaceEvidence = {
        place: adapted.place,
        chunkId: chunk.id.trim(),
        ...withOptional("documentId", documentId),
        ...withOptional("datasetId", datasetId),
        similarity: chunk.similarity,
      }
      const current = selected.get(evidence.place.id)
      if (current === undefined) {
        selected.set(evidence.place.id, evidence)
        return
      }

      if (preferredEvidence(evidence, current)) {
        selected.set(evidence.place.id, evidence)
        rejections.push({
          chunkId: current.chunkId,
          ...withOptional("documentId", current.documentId),
          ...withOptional("datasetId", current.datasetId),
          reason: `duplicate place id ${evidence.place.id}; superseded by chunk ${evidence.chunkId}`,
        })
      } else {
        rejections.push({
          chunkId: evidence.chunkId,
          ...withOptional("documentId", evidence.documentId),
          ...withOptional("datasetId", evidence.datasetId),
          reason: `duplicate place id ${evidence.place.id}; chunk ${current.chunkId} was preferred`,
        })
      }
    } catch (error) {
      rejections.push({
        chunkId,
        ...withOptional("documentId", documentId),
        ...withOptional("datasetId", datasetId),
        reason:
          error instanceof PlaceRecordValidationError
            ? error.message
            : "chunk could not be adapted",
      })
    }
  })

  return {
    accepted: [...selected.values()],
    rejectedCount: rejections.length,
    rejections,
  }
}
