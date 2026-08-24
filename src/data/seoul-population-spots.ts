import type { GeoPosition } from "../lib/geo.js"

export interface SeoulPopulationSpot {
  areaCode: string
  areaName: string
  label: string
  point: GeoPosition
}

/**
 * Representative points for the official Seoul real-time population POIs.
 * The API exposes population by named hotspot rather than by administrative district.
 */
export const SEOUL_POPULATION_SPOTS = [
  { areaCode: "POI043", areaName: "연신내역", label: "은평", point: [126.9208, 37.619] },
  { areaCode: "POI032", areaName: "서울식물원·마곡나루역", label: "강서", point: [126.8275, 37.5664] },
  { areaCode: "POI007", areaName: "홍대 관광특구", label: "마포·홍대", point: [126.9225, 37.5566] },
  { areaCode: "POI009", areaName: "광화문·덕수궁", label: "도심·종로", point: [126.9768, 37.5664] },
  { areaCode: "POI079", areaName: "창동 신경제 중심지", label: "노원", point: [127.0473, 37.6533] },
  { areaCode: "POI072", areaName: "여의도", label: "여의도", point: [126.924, 37.5219] },
  { areaCode: "POI046", areaName: "용산역", label: "용산", point: [126.9647, 37.5298] },
  { areaCode: "POI068", areaName: "성수카페거리", label: "성수", point: [127.0558, 37.543] },
  { areaCode: "POI014", areaName: "강남역", label: "강남", point: [127.0276, 37.4979] },
  { areaCode: "POI005", areaName: "잠실 관광특구", label: "잠실", point: [127.1025, 37.511] },
  { areaCode: "POI050", areaName: "천호역", label: "강동", point: [127.1238, 37.5386] },
] as const satisfies readonly SeoulPopulationSpot[]

export const SEOUL_POPULATION_SOURCE = {
  label: "서울시 실시간 인구데이터",
  url: "https://data.seoul.go.kr/dataList/OA-21778/A/1/datasetView.do",
} as const
