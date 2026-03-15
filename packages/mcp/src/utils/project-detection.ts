import { execFile } from "node:child_process"
import { basename } from "node:path"

interface ProjectCandidate {
  id: string
  name: string
  keywords: string[]
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
  const dirName = getDirectoryName()
  const remoteUrl = await getGitRemoteUrl()
  const repoName = remoteUrl ? extractRepoName(remoteUrl) : null

  const signals = [dirName, repoName].filter((s): s is string => s !== null)

  for (const project of projects) {
    const projectNameLower = project.name.toLowerCase()

    // Exact name match
    for (const signal of signals) {
      if (signal === projectNameLower) {
        return project.id
      }
    }

    // Keyword match
    for (const signal of signals) {
      for (const keyword of project.keywords) {
        if (signal === keyword.toLowerCase() || signal.includes(keyword.toLowerCase())) {
          return project.id
        }
      }
    }
  }

  return null
}
