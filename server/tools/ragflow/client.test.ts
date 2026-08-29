import { describe, expect, it, vi } from "vitest"

import type { RagflowConfig } from "../shared/config.ts"
import { RagflowClient } from "./client.ts"

const config: RagflowConfig = {
  baseUrl: "https://ragflow.example.com",
  apiKey: "secret-ragflow-key",
  datasetIds: ["places", "festivals"],
  allowedSourceHosts: ["data.seoul.go.kr"],
  maxSourceAgeDays: 30,
  pageSize: 30,
  similarityThreshold: 0.24,
  vectorSimilarityWeight: 0.35,
  knnTopK: 1_024,
  requestTimeoutMs: 5_000,
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

describe("RagflowClient", () => {
  it("uses the v0.27 retrieval contract and server-side Bearer authentication", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        code: 0,
        data: {
          total: 1,
          chunks: [
            {
              id: "chunk-1",
              document_id: "document-1",
              dataset_id: "places",
              content: '{"id":"place-1"}',
              similarity: 0.91,
            },
          ],
        },
      }),
    )
    const client = new RagflowClient(config, fetchMock as typeof fetch)

    const result = await client.retrieve("서울 무료 전시")

    expect(result).toEqual({
      total: 1,
      chunks: [
        {
          id: "chunk-1",
          documentId: "document-1",
          datasetId: "places",
          content: '{"id":"place-1"}',
          similarity: 0.91,
        },
      ],
    })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("https://ragflow.example.com/api/v1/retrieval")
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret-ragflow-key" })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      question: "서울 무료 전시",
      dataset_ids: ["places", "festivals"],
      page_size: 30,
      similarity_threshold: 0.24,
      vector_similarity_weight: 0.35,
      knn_top_k: 1_024,
      knn_num_candidates: 2_048,
      rerank_candidates_count: 64,
      include_knowledge_compilation: false,
    })
  })

  it("checks RAGFlow's JSON envelope even when HTTP succeeds", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({ code: 108, message: "dataset not found", data: null }),
    )
    const client = new RagflowClient(config, fetchMock as typeof fetch)

    await expect(client.retrieve("서울 관광")).rejects.toThrow(
      "RAGFlow rejected the retrieval request.",
    )
  })

  it("drops malformed chunk rows without trusting partial upstream data", async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        code: 0,
        data: {
          total: 2,
          chunks: [
            { id: "missing-content", similarity: 0.8 },
            { id: "valid", content: "{}", similarity: "not-a-number" },
          ],
        },
      }),
    )
    const client = new RagflowClient(config, fetchMock as typeof fetch)

    await expect(client.retrieve("서울 관광")).resolves.toEqual({
      total: 2,
      chunks: [],
    })
  })
})
