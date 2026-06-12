import { defineConfig } from "eslint/config"
import tsParser from "@typescript-eslint/parser"
import tsPlugin from "@typescript-eslint/eslint-plugin"
import nextPlugin from "@next/eslint-plugin-next"
import importPlugin from "eslint-plugin-import"
import unusedImports from "eslint-plugin-unused-imports"

export default defineConfig([
  {
    ignores: ["**/.next/**", "**/.plasmo/**", "**/dist/**", "**/build/**", "**/coverage/**"]
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      // Standard namespace so `eslint-disable @next/next/...` comments resolve.
      "@next/next": nextPlugin,
      import: importPlugin,
      "unused-imports": unusedImports
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": ["error", { "checksVoidReturn": false }],
      "import/no-default-export": "off",
      "unused-imports/no-unused-imports": "error"
    },
    settings: {
      next: {
        rootDir: ["apps/web/"]
      }
    }
  }
])
