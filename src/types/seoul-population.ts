export type SeoulCongestionLevel = "여유" | "보통" | "약간 붐빔" | "붐빔"

export interface SeoulPopulationPoint {
  areaCode: string
  areaName: string
  label: string
  lat: number
  lng: number
  congestionLevel: SeoulCongestionLevel
  congestionMessage: string
  populationMin: number
  populationMax: number
  dataTime: string
  replacement: boolean
}

export type SeoulPopulationStatus = "live" | "sample" | "unconfigured" | "error"

export interface SeoulPopulationResponse {
  status: SeoulPopulationStatus
  points: SeoulPopulationPoint[]
  dataTime: string | null
  fetchedAt: string
  message?: string
}
