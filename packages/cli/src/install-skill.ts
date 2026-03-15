import { writeFile, mkdir } from "node:fs/promises"
import { join, dirname } from "node:path"
import { homedir } from "node:os"

import type { DetectedIDE } from "./detect"
import { SKILL_FILE_NAME, SKILL_CONTENT } from "./skill-content"

export async function installSkillFile(ide: DetectedIDE): Promise<string | null> {
  if (!ide.skillDir) return null

  const skillPath = join(ide.skillDir, SKILL_FILE_NAME)
  await mkdir(dirname(skillPath), { recursive: true })
  await writeFile(skillPath, SKILL_CONTENT, "utf-8")
  return skillPath
}

export async function installUniversalSkillFile(): Promise<string> {
  const skillDir = join(homedir(), ".agents", "skills", "relay")
  const skillPath = join(skillDir, SKILL_FILE_NAME)
  await mkdir(skillDir, { recursive: true })
  await writeFile(skillPath, SKILL_CONTENT, "utf-8")
  return skillPath
}
