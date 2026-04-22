import { execFile } from "node:child_process"
import { basename } from "node:path"
import { resolveRelayProjectSelection, type RelayProjectResolutionResult } from "@relay/shared"

interface ProjectCandidate {
  id: string
  name: string
  slug?: string | null
  keywords: string[]
}

function normalizeSignal(value: string | null | undefined) {
  return value?.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") ?? null
}

function getDirectoryName(): string {
  return basename(process.cwd()).toLowerCase()
}

async function getGitRemoteUrl(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["remote", "get-url", "origin"], { timeout: 3000 }, (err, stdout) => {
      if (err) {
        resolve(null)
        return
      }
      resolve(stdout.trim())
    })
  })
}

function extractRepoName(remoteUrl: string): string | null {
  // Handle SSH: git@github.com:user/repo.git
  // Handle HTTPS: https://github.com/user/repo.git
  const match = remoteUrl.match(/\/([^/]+?)(?:\.git)?$/) ?? remoteUrl.match(/:([^/]+?)(?:\.git)?$/)
  return match?.[1]?.toLowerCase() ?? null
}

export async function detectProjectId(projects: ProjectCandidate[]): Promise<string | null> {
  const result = await detectProjectSelection(projects)
  return result.status === "resolved" ? result.projectId : null
}

export async function detectProjectSelection(projects: ProjectCandidate[]): Promise<RelayProjectResolutionResult> {
  const remoteUrl = await getGitRemoteUrl()
  return resolveRelayProjectSelection({
    projects,
    signals: {
      cwdBasename: normalizeSignal(getDirectoryName()),
      repoName: normalizeSignal(remoteUrl ? extractRepoName(remoteUrl) : null),
    },
  })
}
