import { execFileSync } from "node:child_process"

const ROOT_MARKDOWN_WHITELIST = new Set([
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "GEMINI.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "SUPPORT.md",
  "DEPLOYMENT.md",
  "RELEASING.md",
])

const trackedFiles = execFileSync("git", ["ls-files", "-z"], {
  encoding: "utf8",
})
  .split("\0")
  .filter(Boolean)

const failures = []

for (const file of trackedFiles) {
  const isRootFile = !file.includes("/")

  if (isRootFile && file.endsWith(".md") && !ROOT_MARKDOWN_WHITELIST.has(file)) {
    failures.push(`root markdown outside whitelist: ${file}`)
  }

  if (file.startsWith(".claude/")) {
    failures.push(`tracked local Claude state: ${file}`)
  }

  if (file.startsWith(".opencode/")) {
    failures.push(`tracked local OpenCode state: ${file}`)
  }

  if (file === ".DS_Store" || file.endsWith("/.DS_Store")) {
    failures.push(`tracked macOS metadata: ${file}`)
  }

  if (file.includes("/__pycache__/") || file.startsWith("__pycache__/")) {
    failures.push(`tracked Python cache: ${file}`)
  }

  if (file.endsWith(".pyc")) {
    failures.push(`tracked compiled Python artifact: ${file}`)
  }

  if (file.includes("/node_modules/") || file.startsWith("node_modules/")) {
    failures.push(`tracked node_modules content: ${file}`)
  }

  if (file.endsWith(".zip") || file.endsWith(".pptx") || file.endsWith(".eml")) {
    failures.push(`tracked private or packaged artifact: ${file}`)
  }

  if (file === "settings.local.json" || file.endsWith("/settings.local.json")) {
    failures.push(`tracked machine-local settings file: ${file}`)
  }
}

if (failures.length > 0) {
  console.error("Repository cleanliness check failed:\n")
  for (const failure of failures) {
    console.error(`- ${failure}`)
  }
  process.exit(1)
}

console.log("Repository cleanliness check passed.")
