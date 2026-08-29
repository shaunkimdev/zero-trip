import { AirbyteClient, type AirbyteJob } from "./client.ts"
import type { AirbyteConfig } from "../shared/config.ts"
import { ToolHttpError } from "../shared/http-client.ts"

export type AirbyteSyncTarget = "main-db" | "ragflow"

export interface AirbyteSyncResult {
  connectionId: string
  target: AirbyteSyncTarget
  outcome: "started" | "already-running" | "failed"
  job?: AirbyteJob
  message?: string
}

interface ConfiguredConnection {
  id: string
  target: AirbyteSyncTarget
}

export class AirbyteService {
  private readonly connections: readonly ConfiguredConnection[]

  constructor(
    config: AirbyteConfig,
    private readonly client = new AirbyteClient(config),
  ) {
    const byId = new Map<string, ConfiguredConnection>()
    for (const id of config.mainDbConnectionIds) byId.set(id, { id, target: "main-db" })
    for (const id of config.ragflowConnectionIds) byId.set(id, { id, target: "ragflow" })
    this.connections = [...byId.values()]
  }

  counts() {
    return {
      mainDb: this.connections.filter((connection) => connection.target === "main-db").length,
      ragflow: this.connections.filter((connection) => connection.target === "ragflow").length,
    }
  }

  hasConnection(connectionId: string) {
    return this.connections.some((connection) => connection.id === connectionId)
  }

  async trigger(target: AirbyteSyncTarget, connectionId?: string) {
    const selected = this.selectConnections(target, connectionId)
    return Promise.all(
      selected.map(async (connection): Promise<AirbyteSyncResult> => {
        try {
          const job = await this.client.triggerSync(connection.id)
          return {
            connectionId: connection.id,
            target: connection.target,
            outcome: "started",
            job: { ...job, connectionId: job.connectionId ?? connection.id },
          }
        } catch (error) {
          if (error instanceof ToolHttpError && error.status === 409) {
            return {
              connectionId: connection.id,
              target: connection.target,
              outcome: "already-running",
              message: "Airbyte already has an active sync for this connection.",
            }
          }
          return {
            connectionId: connection.id,
            target: connection.target,
            outcome: "failed",
            message: error instanceof Error ? error.message : "Airbyte sync could not be started.",
          }
        }
      }),
    )
  }

  async getJob(jobId: string) {
    const job = await this.client.getJob(jobId)
    if (!job.connectionId || !this.hasConnection(job.connectionId)) {
      throw new RangeError(
        "The Airbyte job does not belong to a configured Zero Trip connection.",
      )
    }
    return job
  }

  async setCronSchedule(connectionId: string, cronExpression: string) {
    if (!this.hasConnection(connectionId)) {
      throw new RangeError("Unknown Airbyte connection ID.")
    }
    await this.client.setCronSchedule(connectionId, cronExpression)
  }

  private selectConnections(target: AirbyteSyncTarget, connectionId?: string) {
    if (connectionId) {
      const selected = this.connections.find((connection) => connection.id === connectionId)
      if (!selected) throw new RangeError("Unknown Airbyte connection ID.")
      if (target !== selected.target) {
        throw new RangeError("The Airbyte connection does not match the requested target.")
      }
      return [selected]
    }

    const selected = this.connections.filter((connection) => connection.target === target)
    if (selected.length === 0) {
      throw new RangeError(`No Airbyte connections are configured for ${target}.`)
    }
    return selected
  }
}
