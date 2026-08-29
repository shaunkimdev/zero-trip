export const COMPANIONS = [
  "solo",
  "couple",
  "children",
  "parents",
  "pet",
] as const

export type Companion = (typeof COMPANIONS)[number]

export const INTERESTS = [
  "free",
  "exhibition",
  "night-view",
  "walk",
  "cafe",
  "food",
  "performance",
  "park",
  "culture",
  "photo",
  "rest",
] as const

export type Interest = (typeof INTERESTS)[number]

export const AVOIDANCES = [
  "crowds",
  "waiting",
  "long-walk",
  "outdoors",
  "stairs",
  "long-distance",
] as const

export type Avoidance = (typeof AVOIDANCES)[number]

export const PLACE_CATEGORIES = [
  "museum",
  "exhibition",
  "event",
  "performance",
  "park",
  "walk",
  "night-view",
  "rest",
  "cafe",
  "restaurant",
  "landmark",
] as const

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number]

export const PLACE_CLUSTERS = [
  "jongno",
  "seongsu",
  "yeouido-mapo",
  "gangnam",
  "gangdong",
  "gangbuk",
  "gangseo",
  "gwanak",
  "gwangjin",
  "guro",
  "geumcheon",
  "nowon",
  "dobong",
  "dongdaemun",
  "dongjak",
  "eunpyeong",
  "jung",
  "jungnang",
  "mapo",
  "seodaemun",
  "seocho",
  "seongbuk",
  "seongdong",
  "songpa",
  "yangcheon",
  "yeongdeungpo",
  "yongsan",
] as const

export type PlaceCluster = (typeof PLACE_CLUSTERS)[number]

export type PriceKind = "free" | "paid" | "unknown"
export type PriceBasis = "admission" | "per-person"
export type CrowdLevel = "low" | "medium" | "high"

export type Weekday =
  | "sun"
  | "mon"
  | "tue"
  | "wed"
  | "thu"
  | "fri"
  | "sat"

export interface GeoPoint {
  lat: number
  lng: number
}

export interface TimeWindow {
  /** 24-hour time in HH:mm format. `24:00` is accepted as the end of a day. */
  open: string
  close: string
  lastAdmissionMinutesBeforeClose?: number
}

export type WeeklyOpeningHours = Record<Weekday, readonly TimeWindow[]>

export interface PlacePrice {
  kind: PriceKind
  /** Admission uses age-specific fields; per-person uses the conservative range below. */
  basis: PriceBasis
  adultWon: number | null
  youthWon: number | null
  childWon: number | null
  minimumWon: number | null
  maximumWon: number | null
  note?: string
}

export interface WifiInfo {
  available: boolean
  ssid?: string
  location?: string
}

export interface PlaceAmenities {
  wifi: WifiInfo
  restroom: boolean
  accessible: boolean | "unknown"
  petFriendly: boolean | "unknown"
}

export interface EventSchedule {
  /** Inclusive ISO dates in YYYY-MM-DD format. */
  startDate: string
  endDate: string
  /** A fixed program start time. Visitors may arrive early and wait. */
  fixedStartTime?: string
  requiresReservation?: boolean
}

export type PlaceTag =
  | Interest
  | "art"
  | "history"
  | "architecture"
  | "indoor"
  | "outdoor"
  | "quiet"
  | "river"
  | "garden"
  | "library"
  | "family"
  | "accessible"
  | "pet-friendly"

export interface PlaceSource {
  name: string
  url?: string
  updatedAt: string
}

export interface Place {
  id: string
  name: string
  cluster: PlaceCluster
  category: PlaceCategory
  location: GeoPoint
  address: string
  summary: string
  recommendedVisitMinutes: number
  price: PlacePrice
  openingHours: WeeklyOpeningHours
  event?: EventSchedule
  tags: readonly PlaceTag[]
  companions: readonly Companion[]
  avoidFlags: readonly Avoidance[]
  amenities: PlaceAmenities
  crowdLevel: CrowdLevel
  source: PlaceSource
  availabilityNote?: string
}

export interface TripRequest {
  origin: GeoPoint & { label?: string }
  /** A Date or an ISO date string (YYYY-MM-DD), interpreted in Asia/Seoul. */
  date: string | Date
  startTime: string
  endTime: string
  /** Budget cap. Admissions, selected cafe items, and selected meals count; transport does not. */
  budgetWon: number
  maxWalkingKm: number
  companion: Companion
  wants: readonly Interest[]
  avoids: readonly Avoidance[]
  partySize?: number
  /** Changes deterministic tie-breaking when the user asks for another route. */
  variant?: number
}

export interface PlannedStop {
  place: Place
  arriveMinute: number
  startMinute: number
  departMinute: number
  arriveTime: string
  startTime: string
  departTime: string
  waitMinutes: number
  costWon: number
  score: number
  reasons: readonly string[]
}

export interface RouteLeg {
  fromId: "origin" | string
  toId: string
  mode: "walk"
  distanceMeters: number
  durationMinutes: number
}

export interface TripCostBreakdown {
  admissionWon: number
  exhibitionWon: number
  performanceWon: number
  cafeWon: number
  mealWon: number
  wifiWon: 0
  totalWon: number
}

export interface TripTotals {
  durationMinutes: number
  activityMinutes: number
  walkingMinutes: number
  waitingMinutes: number
  walkingMeters: number
  contentCostWon: number
  stopCount: number
}

export interface TripGrounding {
  /** Whether this plan came from evidence retrieved at request time or the local demo catalog. */
  mode: "ragflow" | "demo"
  provider: string
  retrievedAt: string
  retrievedChunkCount: number
  acceptedPlaceCount: number
  rejectedChunkCount: number
}

export interface TripPlan {
  id: string
  title: string
  request: TripRequest
  stops: readonly PlannedStop[]
  legs: readonly RouteLeg[]
  costs: TripCostBreakdown
  totals: TripTotals
  warnings: readonly string[]
  /** Optional for backward compatibility with plans saved before server-side retrieval was added. */
  grounding?: TripGrounding
}

export const COMPANION_LABELS: Record<Companion, string> = {
  solo: "혼자",
  couple: "연인",
  children: "아이",
  parents: "부모님",
  pet: "반려견",
}

export const INTEREST_LABELS: Record<Interest, string> = {
  free: "무료",
  exhibition: "전시",
  "night-view": "전망·야경",
  walk: "산책",
  cafe: "카페",
  food: "식사",
  performance: "공연",
  park: "공원",
  culture: "문화",
  photo: "사진",
  rest: "휴식",
}

export const AVOIDANCE_LABELS: Record<Avoidance, string> = {
  crowds: "사람 많은 곳",
  waiting: "긴 대기",
  "long-walk": "많이 걷기",
  outdoors: "야외",
  stairs: "계단",
  "long-distance": "장거리 이동",
}

export const CATEGORY_LABELS: Record<PlaceCategory, string> = {
  museum: "박물관",
  exhibition: "전시",
  event: "행사",
  performance: "공연",
  park: "공원",
  walk: "산책",
  "night-view": "야경",
  rest: "휴식",
  cafe: "카페",
  restaurant: "식당",
  landmark: "명소",
}
