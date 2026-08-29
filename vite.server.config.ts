import { defineConfig } from "vite"

export default defineConfig({
  build: {
    ssr: "server/standalone.ts",
    outDir: "server-dist",
    emptyOutDir: true,
    target: "node22",
    rollupOptions: {
      output: {
        entryFileNames: "zero-trip-api.mjs",
      },
    },
  },
})
