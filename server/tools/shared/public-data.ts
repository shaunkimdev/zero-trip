/**
 * data.go.kr shows both encoded and decoded service keys. URLSearchParams
 * performs its own encoding, so an already encoded key must be decoded once
 * before it is assigned or `%2B` would become `%252B`.
 */
export function normalizePublicDataServiceKey(serviceKey: string): string {
  const trimmed = serviceKey.trim()
  if (!trimmed) throw new TypeError("A public-data service key is required.")
  if (!/%[0-9a-f]{2}/i.test(trimmed)) return trimmed
  try {
    return decodeURIComponent(trimmed)
  } catch {
    return trimmed
  }
}

export function setPublicDataServiceKey(url: URL, serviceKey: string): void {
  url.searchParams.set("serviceKey", normalizePublicDataServiceKey(serviceKey))
}

export function publicDataItems(value: unknown): readonly unknown[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return []
  const items = (value as Record<string, unknown>).item
  if (Array.isArray(items)) return items
  return items === undefined || items === null || items === "" ? [] : [items]
}
