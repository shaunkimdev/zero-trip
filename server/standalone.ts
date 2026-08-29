import { createServer } from "node:http"

import { createToolsMiddleware } from "./tools/api.ts"
import { loadToolConfig } from "./tools/shared/config.ts"
import { ZeroTripToolManager } from "./tools/tool-manager.ts"

const environment = process.env as Readonly<Record<string, string | undefined>>
const config = loadToolConfig(environment)
const manager = new ZeroTripToolManager(config)
const toolsMiddleware = createToolsMiddleware(manager, config.adminToken, config.api)
const parsedPort = Number(environment.ZERO_TRIP_API_PORT ?? environment.PORT ?? 3_000)
if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65_535) {
  throw new RangeError("ZERO_TRIP_API_PORT must be an integer between 1 and 65535.")
}
const host = environment.ZERO_TRIP_API_HOST?.trim() || "0.0.0.0"

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://localhost")
  if (url.pathname === "/healthz") {
    if (request.method !== "GET") {
      response.statusCode = 405
      response.setHeader("Allow", "GET")
      response.end()
      return
    }
    response.statusCode = 200
    response.setHeader("Content-Type", "application/json; charset=utf-8")
    response.setHeader("Cache-Control", "no-store")
    response.end(JSON.stringify({ status: "ok" }))
    return
  }

  void toolsMiddleware(request, response, () => {
    response.statusCode = 404
    response.setHeader("Content-Type", "application/json; charset=utf-8")
    response.end(
      JSON.stringify({ error: { code: "NOT_FOUND", message: "API route not found." } }),
    )
  })
})

server.headersTimeout = 10_000
server.requestTimeout = 75_000
server.keepAliveTimeout = 5_000
server.listen(parsedPort, host, () => {
  console.info(`ZERO TRIP API listening on http://${host}:${parsedPort}`)
})

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error("ZERO TRIP API shutdown failed.", error)
      process.exitCode = 1
    }
  })
}

process.once("SIGINT", shutdown)
process.once("SIGTERM", shutdown)
