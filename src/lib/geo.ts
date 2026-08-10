export type GeoPosition = readonly [lng: number, lat: number]

export interface GeoPolygon {
  type: "Polygon"
  coordinates: readonly (readonly GeoPosition[])[]
}

export interface GeoMultiPolygon {
  type: "MultiPolygon"
  coordinates: readonly (readonly (readonly GeoPosition[])[])[]
}

export type GeoGeometry = GeoPolygon | GeoMultiPolygon

export interface GeoFeature<Properties = Record<string, unknown>> {
  type: "Feature"
  properties: Properties
  geometry: GeoGeometry
}

export interface GeoFeatureCollection<Properties = Record<string, unknown>> {
  type: "FeatureCollection"
  features: readonly GeoFeature<Properties>[]
}

export interface GeoBounds {
  minLng: number
  minLat: number
  maxLng: number
  maxLat: number
}

export interface GeoProjection {
  width: number
  height: number
  project: (point: GeoPosition) => { x: number; y: number }
  invert: (point: { x: number; y: number }) => GeoPosition
}

export interface SampledGeoDot {
  id: string
  x: number
  y: number
  lng: number
  lat: number
  featureIndex: number
}

function visitPositions(geometry: GeoGeometry, visit: (position: GeoPosition) => void) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const position of ring) visit(position)
    }
  }
}

export function getFeatureCollectionBounds<Properties>(
  collection: GeoFeatureCollection<Properties>,
): GeoBounds {
  const bounds: GeoBounds = {
    minLng: Number.POSITIVE_INFINITY,
    minLat: Number.POSITIVE_INFINITY,
    maxLng: Number.NEGATIVE_INFINITY,
    maxLat: Number.NEGATIVE_INFINITY,
  }

  for (const feature of collection.features) {
    visitPositions(feature.geometry, ([lng, lat]) => {
      bounds.minLng = Math.min(bounds.minLng, lng)
      bounds.minLat = Math.min(bounds.minLat, lat)
      bounds.maxLng = Math.max(bounds.maxLng, lng)
      bounds.maxLat = Math.max(bounds.maxLat, lat)
    })
  }

  if (!Number.isFinite(bounds.minLng)) {
    throw new Error("GeoJSON collection does not contain any coordinates.")
  }

  return bounds
}

export function pointInRing([lng, lat]: GeoPosition, ring: readonly GeoPosition[]) {
  let inside = false

  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentLng, currentLat] = ring[index]
    const [previousLng, previousLat] = ring[previous]
    const crossesLatitude = currentLat > lat !== previousLat > lat
    const intersectionLng =
      ((previousLng - currentLng) * (lat - currentLat)) /
        (previousLat - currentLat || Number.EPSILON) +
      currentLng

    if (crossesLatitude && lng < intersectionLng) inside = !inside
  }

  return inside
}

function pointInPolygon(point: GeoPosition, polygon: readonly (readonly GeoPosition[])[]) {
  const [outer, ...holes] = polygon
  if (!outer || !pointInRing(point, outer)) return false
  return !holes.some((hole) => pointInRing(point, hole))
}

export function pointInGeometry(point: GeoPosition, geometry: GeoGeometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates
  return polygons.some((polygon) => pointInPolygon(point, polygon))
}

export function findContainingFeature<Properties>(
  point: GeoPosition,
  collection: GeoFeatureCollection<Properties>,
) {
  return collection.features.findIndex((feature) => pointInGeometry(point, feature.geometry))
}

export function createGeoProjection(
  bounds: GeoBounds,
  width: number,
  height: number,
  padding: number,
): GeoProjection {
  const middleLatitude = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180)
  const longitudeCorrection = Math.cos(middleLatitude)
  const geographicWidth = Math.max((bounds.maxLng - bounds.minLng) * longitudeCorrection, Number.EPSILON)
  const geographicHeight = Math.max(bounds.maxLat - bounds.minLat, Number.EPSILON)
  const scale = Math.min((width - padding * 2) / geographicWidth, (height - padding * 2) / geographicHeight)
  const renderedWidth = geographicWidth * scale
  const renderedHeight = geographicHeight * scale
  const offsetX = (width - renderedWidth) / 2
  const offsetY = (height - renderedHeight) / 2

  return {
    width,
    height,
    project: ([lng, lat]) => ({
      x: offsetX + (lng - bounds.minLng) * longitudeCorrection * scale,
      y: offsetY + (bounds.maxLat - lat) * scale,
    }),
    invert: ({ x, y }) => [
      bounds.minLng + (x - offsetX) / scale / longitudeCorrection,
      bounds.maxLat - (y - offsetY) / scale,
    ],
  }
}

export function sampleFeatureCollection<Properties>(
  collection: GeoFeatureCollection<Properties>,
  projection: GeoProjection,
  spacing: number,
) {
  const dots: SampledGeoDot[] = []

  for (let y = spacing / 2; y < projection.height; y += spacing) {
    for (let x = spacing / 2; x < projection.width; x += spacing) {
      const [lng, lat] = projection.invert({ x, y })
      const featureIndex = findContainingFeature([lng, lat], collection)

      if (featureIndex >= 0) {
        dots.push({
          id: `${Math.round(x)}-${Math.round(y)}`,
          x,
          y,
          lng,
          lat,
          featureIndex,
        })
      }
    }
  }

  return dots
}
