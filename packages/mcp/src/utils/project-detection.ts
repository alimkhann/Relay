import { execFile } from "node:child_process"
import { basename } from "node:path"

interface ProjectCandidate {
  id: string
  name: string
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
  const dirName = normalizeSignal(getDirectoryName())
  const remoteUrl = await getGitRemoteUrl()
  const repoName = normalizeSignal(remoteUrl ? extractRepoName(remoteUrl) : null)

  const signals = [dirName, repoName].filter((s): s is string => s !== null)

  const ranked = projects
    .map((project) => {
      const normalizedName = normalizeSignal(project.name) ?? ""
      const normalizedKeywords = project.keywords.map((keyword) => normalizeSignal(keyword)).filter((keyword): keyword is string => Boolean(keyword))
      let score = 0

      for (const signal of signals) {
        if (!signal) continue
        if (signal === normalizedName) {
          score += 100
        } else if (normalizedName.includes(signal) || signal.includes(normalizedName)) {
          score += 60
        }

        for (const keyword of normalizedKeywords) {
          if (signal === keyword) {
            score += 90
          } else if (signal.includes(keyword) || keyword.includes(signal)) {
            score += 45
          }
        }
      }

      return { projectId: project.id, score }
    })
    .sort((left, right) => right.score - left.score)

  const top = ranked[0]
  const runnerUp = ranked[1]
  if (!top || top.score < 60) {
    return null
  }

  if (runnerUp && top.score - runnerUp.score < 18) {
    return null
  }

  return top.projectId
}
