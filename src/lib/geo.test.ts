import { describe, expect, it } from "vitest"

import {
  createGeoProjection,
  getFeatureCollectionBounds,
  pointInGeometry,
  sampleFeatureCollection,
  type GeoFeatureCollection,
} from "./geo"

const collection: GeoFeatureCollection<{ name: string }> = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { name: "test" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          [
            [4, 4],
            [6, 4],
            [6, 6],
            [4, 6],
            [4, 4],
          ],
        ],
      },
    },
  ],
}

describe("dot atlas geometry", () => {
  it("includes outer polygon points and excludes holes", () => {
    expect(pointInGeometry([2, 2], collection.features[0].geometry)).toBe(true)
    expect(pointInGeometry([5, 5], collection.features[0].geometry)).toBe(false)
    expect(pointInGeometry([12, 5], collection.features[0].geometry)).toBe(false)
  })

  it("samples a uniform projected grid only inside the geometry", () => {
    const bounds = getFeatureCollectionBounds(collection)
    const projection = createGeoProjection(bounds, 100, 100, 0)
    const dots = sampleFeatureCollection(collection, projection, 10)

    expect(dots.length).toBeGreaterThan(0)
    expect(dots.every((dot) => pointInGeometry([dot.lng, dot.lat], collection.features[0].geometry))).toBe(true)
    expect(new Set(dots.map((dot) => dot.x % 10)).size).toBe(1)
    expect(new Set(dots.map((dot) => dot.y % 10)).size).toBe(1)
  })
})
