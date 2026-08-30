import { describe, expect, it } from "vitest"

import {
  normalizePublicDataServiceKey,
  publicDataItems,
  setPublicDataServiceKey,
} from "./public-data.ts"

describe("public data helpers", () => {
  it("normalizes encoded and decoded service keys to one URL encoding pass", () => {
    const decoded = "abc+123/=="
    const encoded = "abc%2B123%2F%3D%3D"

    expect(normalizePublicDataServiceKey(encoded)).toBe(decoded)
    const decodedUrl = new URL("https://apis.data.go.kr/example")
    const encodedUrl = new URL("https://apis.data.go.kr/example")
    setPublicDataServiceKey(decodedUrl, decoded)
    setPublicDataServiceKey(encodedUrl, encoded)

    expect(decodedUrl.searchParams.get("serviceKey")).toBe(decoded)
    expect(encodedUrl.searchParams.get("serviceKey")).toBe(decoded)
    expect(encodedUrl.toString()).not.toContain("%252B")
  })

  it("normalizes empty, singleton, and array public-data item shapes", () => {
    expect(publicDataItems("")).toEqual([])
    expect(publicDataItems({ item: "" })).toEqual([])
    expect(publicDataItems({ item: { id: 1 } })).toEqual([{ id: 1 }])
    expect(publicDataItems({ item: [{ id: 1 }, { id: 2 }] })).toEqual([
      { id: 1 },
      { id: 2 },
    ])
  })
})
