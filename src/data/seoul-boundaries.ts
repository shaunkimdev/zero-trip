import seoulBoundaryRaw from "./seoul-gu.geojson?raw"

import type { GeoFeatureCollection } from "../lib/geo.ts"

export interface SeoulGuProperties {
  code: string
  name: string
  name_eng: string
  base_year: string
}

export const SEOUL_BOUNDARY_SOURCE = {
  label: "서울 행정경계 GeoJSON · KOSTAT 2013",
  url: "https://github.com/southkorea/seoul-maps",
  license: "Apache-2.0",
} as const

export const seoulGuBoundaries = JSON.parse(
  seoulBoundaryRaw,
) as GeoFeatureCollection<SeoulGuProperties>
