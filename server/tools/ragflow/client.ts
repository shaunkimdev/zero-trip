import type { RagflowConfig } from "../shared/config.ts"
import {
  requestJson,
  ToolHttpError,
  type Fetch,
} from "../shared/http-client.ts"

interface RagflowEnvelope<T> {
  code?: number
  data?: T
  message?: string
}

interface RagflowRetrievalData {
  chunks?: unknown[]
  total?: number
}

export interface RagflowChunk {
  id: string
  content: string
  documentId?: string
  datasetId?: string
  similarity: number
}

export interface RagflowRetrievalResult {
  chunks: readonly RagflowChunk[]
  total: number
}

function apiRoot(baseUrl: string) {
  return baseUrl.endsWith("/api/v1") ? baseUrl : `${baseUrl}/api/v1`
}

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined
}

function finiteNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function normalizeChunk(value: unknown): RagflowChunk | null {
  const row = object(value)
  if (!row) return null
  const id = text(row.id)
  const content = text(row.content)
  const similarity = finiteNumber(row.similarity)
  if (!id || !content || similarity === undefined) return null
  return {
    id,
    content,
    documentId: text(row.document_id),
    datasetId: text(row.dataset_id) ?? text(row.kb_id),
    similarity,
  }
}

export class RagflowClient {
  constructor(
    private readonly config: RagflowConfig,
    private readonly fetchImplementation: Fetch = fetch,
  ) {}

  async retrieve(question: string): Promise<RagflowRetrievalResult> {
    const normalizedQuestion = question.trim()
    if (!normalizedQuestion) throw new TypeError("RAGFlow retrieval question is required.")
    if (normalizedQuestion.length > 4_000) {
      throw new RangeError("RAGFlow retrieval question is too long.")
    }

    const response = await requestJson<RagflowEnvelope<RagflowRetrievalData>>(
      `${apiRoot(this.config.baseUrl)}/retrieval`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          question: normalizedQuestion,
          dataset_ids: this.config.datasetIds,
          page: 1,
          page_size: this.config.pageSize,
          similarity_threshold: this.config.similarityThreshold,
          vector_similarity_weight: this.config.vectorSimilarityWeight,
          knn_top_k: this.config.knnTopK,
          knn_num_candidates: Math.max(2_048, this.config.knnTopK),
          rerank_candidates_count: Math.max(64, this.config.pageSize),
          keyword: true,
          highlight: false,
          include_knowledge_compilation: false,
        }),
      },
      {
        tool: "ragflow",
        timeoutMs: this.config.requestTimeoutMs,
        fetchImplementation: this.fetchImplementation,
      },
    )

    if (response.code !== 0 || !response.data) {
      throw new ToolHttpError("RAGFlow rejected the retrieval request.", null, "ragflow")
    }

    const chunks = (response.data.chunks ?? []).flatMap((chunk) => {
      const normalized = normalizeChunk(chunk)
      return normalized ? [normalized] : []
    })

    return {
      chunks,
      total:
        typeof response.data.total === "number" && Number.isFinite(response.data.total)
          ? response.data.total
          : chunks.length,
    }
  }
}
