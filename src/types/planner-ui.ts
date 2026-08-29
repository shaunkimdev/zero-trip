export type OriginKey = "cityhall" | "jongno" | "seongsu" | "yeouido" | "mangwon" | "current"
export type CompanionKey = "solo" | "couple" | "children" | "parents" | "pet"
export type WantKey =
  | "free"
  | "exhibition"
  | "night-view"
  | "walk"
  | "cafe"
  | "food"
  | "performance"
  | "park"
  | "culture"
  | "photo"
  | "rest"
export interface PlannerValues {
  originKey: OriginKey
  originLabel: string
  lat: number
  lng: number
  date: string
  startMin: number
  durationMin: number
  budget: number
  companion: CompanionKey
  wants: WantKey[]
}

export interface OriginOption {
  key: Exclude<OriginKey, "current">
  label: string
  sublabel: string
  lat: number
  lng: number
}

export const ORIGINS: OriginOption[] = [
  { key: "cityhall", label: "서울시청", sublabel: "중구 · 중심에서 시작", lat: 37.5663, lng: 126.9779 },
  { key: "jongno", label: "안국역", sublabel: "종로 · 전시와 산책", lat: 37.5765, lng: 126.9854 },
  { key: "seongsu", label: "서울숲역", sublabel: "성수 · 공원과 문화", lat: 37.5436, lng: 127.0447 },
  { key: "yeouido", label: "여의나루역", sublabel: "여의도 · 한강과 야경", lat: 37.5271, lng: 126.9329 },
  { key: "mangwon", label: "망원역", sublabel: "마포 · 산책과 노을", lat: 37.556, lng: 126.9101 },
]

export function localDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? ""
  return `${part("year")}-${part("month")}-${part("day")}`
}

export function getNextPlanningStart(now = new Date()) {
  const timeParts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now)
  const timePart = (type: "hour" | "minute") =>
    Number(timeParts.find((item) => item.type === type)?.value ?? 0)
  const roundedMinutes = Math.ceil((timePart("hour") * 60 + timePart("minute")) / 30) * 30
  const earliestStart = 9 * 60
  const latestStart = 21 * 60

  if (roundedMinutes > latestStart) {
    const [year, month, day] = localDateString(now).split("-").map(Number)
    const tomorrow = new Date(Date.UTC(year, month - 1, day + 1, 12))
    return { date: localDateString(tomorrow), startMin: 12 * 60 + 30 }
  }

  return {
    date: localDateString(now),
    startMin: Math.max(earliestStart, roundedMinutes),
  }
}

export function getMinimumPlanningDate(now = new Date()) {
  return getNextPlanningStart(now).date
}

const initialSchedule = getNextPlanningStart()

export const DEFAULT_PLANNER_VALUES: PlannerValues = {
  originKey: "jongno",
  originLabel: "안국역",
  lat: 37.5765,
  lng: 126.9854,
  date: initialSchedule.date,
  startMin: initialSchedule.startMin,
  durationMin: 360,
  budget: 0,
  companion: "couple",
  wants: ["free", "exhibition", "walk", "night-view"],
}
