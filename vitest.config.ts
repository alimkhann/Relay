import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  esbuild: {
    jsx: "automatic"
  },
  resolve: {
    alias: [
      { find: "@", replacement: path.resolve(__dirname, "apps/web/src") },
      // Exact-match only: the bare "@relay/shared" specifier fails Vite's
      // import-analysis when a package source file (e.g. mcp/src/client.ts) is
      // reached as a near-entry rather than transitively. Point it straight at
      // the workspace source — the same target as the package's "." export —
      // without affecting subpath imports like "@relay/shared/utils/*".
      { find: /^@relay\/shared$/, replacement: path.resolve(__dirname, "packages/shared/src/index.ts") },
    ]
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
