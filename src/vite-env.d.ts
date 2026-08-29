/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ZERO_TRIP_API_MODE?: "required" | "optional"
  readonly VITE_ZERO_TRIP_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
