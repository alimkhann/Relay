import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "apps/web/src")
    }
  },
  test: {
    include: [
      "packages/**/src/**/*.test.ts",
      "packages/**/src/**/*.test.tsx",
      "apps/web/src/**/*.test.ts",
      "apps/web/src/**/*.test.tsx",
      "apps/extension/src/**/*.test.ts",
      "apps/extension/src/**/*.test.tsx"
    ],
    environment: "jsdom",
    globals: true
  }
})
