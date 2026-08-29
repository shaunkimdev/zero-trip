import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

import { seoulPopulationApi } from "./server/seoul-population-api.ts"
import { zeroTripToolsApi } from "./server/tools/api.ts"

const [repositoryOwner, repositoryName] = (process.env.GITHUB_REPOSITORY ?? "").split("/")
const pagesBase =
  process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? repositoryName === `${repositoryOwner}.github.io`
      ? "/"
      : `/${repositoryName}/`
    : "/"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "")

  return {
    base: pagesBase,
    plugins: [
      react(),
      tailwindcss(),
      zeroTripToolsApi(env),
      seoulPopulationApi(env.SEOUL_OPEN_DATA_KEY ?? process.env.SEOUL_OPEN_DATA_KEY),
    ],
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
      },
    },
  }
})
