import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const [repositoryOwner, repositoryName] = (process.env.GITHUB_REPOSITORY ?? "").split("/")
const pagesBase =
  process.env.GITHUB_ACTIONS === "true" && repositoryName
    ? repositoryName === `${repositoryOwner}.github.io`
      ? "/"
      : `/${repositoryName}/`
    : "/"

export default defineConfig({
  base: pagesBase,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
})
