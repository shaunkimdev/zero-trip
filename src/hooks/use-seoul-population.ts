import { useCallback, useEffect, useState } from "react"

import type { SeoulPopulationResponse } from "@/types/seoul-population"

const REFRESH_INTERVAL_MS = 5 * 60 * 1_000

interface SeoulPopulationState {
  data: SeoulPopulationResponse | null
  loading: boolean
  error: string | null
}

const initialState: SeoulPopulationState = {
  data: null,
  loading: true,
  error: null,
}

export function useSeoulPopulation() {
  const [state, setState] = useState<SeoulPopulationState>(initialState)

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setState((current) => ({ ...current, loading: true, error: null }))

    try {
      const response = await fetch("/api/seoul-population", {
        signal,
        headers: { Accept: "application/json" },
      })
      const data = (await response.json()) as SeoulPopulationResponse
      if (!response.ok) throw new Error(data.message ?? "실시간 인구 데이터를 불러오지 못했어요.")
      setState({ data, loading: false, error: null })
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return
      setState((current) => ({
        data: current.data,
        loading: false,
        error: error instanceof Error ? error.message : "실시간 인구 데이터를 불러오지 못했어요.",
      }))
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    void refresh(controller.signal)
    const interval = window.setInterval(() => void refresh(), REFRESH_INTERVAL_MS)

    return () => {
      controller.abort()
      window.clearInterval(interval)
    }
  }, [refresh])

  return { ...state, refresh: () => refresh() }
}
