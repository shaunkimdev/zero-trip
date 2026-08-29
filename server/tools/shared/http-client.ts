export type Fetch = typeof fetch

export class ToolHttpError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly tool: "ragflow" | "airbyte",
  ) {
    super(message)
    this.name = "ToolHttpError"
  }
}

interface JsonRequestOptions {
  tool: "ragflow" | "airbyte"
  timeoutMs: number
  fetchImplementation?: Fetch
}

const MAX_RESPONSE_BYTES = 5_000_000

async function limitedResponseText(
  response: Response,
  tool: JsonRequestOptions["tool"],
) {
  const contentLength = Number(response.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new ToolHttpError(
      `${tool} returned an unexpectedly large response.`,
      response.status,
      tool,
    )
  }
  if (!response.body) return ""

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const parts: string[] = []
  let receivedBytes = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    receivedBytes += value.byteLength
    if (receivedBytes > MAX_RESPONSE_BYTES) {
      await reader.cancel()
      throw new ToolHttpError(
        `${tool} returned an unexpectedly large response.`,
        response.status,
        tool,
      )
    }
    parts.push(decoder.decode(value, { stream: true }))
  }
  parts.push(decoder.decode())
  return parts.join("")
}

export async function requestJson<T>(
  url: string,
  init: RequestInit,
  options: JsonRequestOptions,
): Promise<T> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs)
  const fetchImplementation = options.fetchImplementation ?? fetch

  try {
    const response = await fetchImplementation(url, {
      ...init,
      signal: controller.signal,
    })
    if (!response.ok) {
      throw new ToolHttpError(
        `${options.tool} request failed with HTTP ${response.status}.`,
        response.status,
        options.tool,
      )
    }
    const text = await limitedResponseText(response, options.tool)
    try {
      return JSON.parse(text) as T
    } catch {
      throw new ToolHttpError(
        `${options.tool} returned invalid JSON.`,
        response.status,
        options.tool,
      )
    }
  } catch (error) {
    if (error instanceof ToolHttpError) throw error
    if (error instanceof Error && error.name === "AbortError") {
      throw new ToolHttpError(
        `${options.tool} request timed out after ${options.timeoutMs}ms.`,
        null,
        options.tool,
      )
    }
    throw new ToolHttpError(`${options.tool} could not be reached.`, null, options.tool)
  } finally {
    clearTimeout(timeout)
  }
}
