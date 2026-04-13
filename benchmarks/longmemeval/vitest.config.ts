import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: here,
  test: {
    include: [resolve(here, "src/**/*.test.ts")],
    environment: "node",
  },
})
