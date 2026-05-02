import { defineConfig } from "tsup"

export default defineConfig({
  entry: ["src/index.ts", "src/flush-cli.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node"
  }
})
