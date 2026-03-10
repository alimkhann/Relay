import { isoNow } from "@relay/shared"

import type { DatabaseProvider } from "../store/provider"

export class MemberRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  async ensureOwner(projectId: string, userId: string): Promise<void> {
    if (this.provider.mode === "memory") {
      const existing = this.provider.store.projectMembers.find((member) => member.projectId === projectId && member.userId === userId)
      if (!existing) {
        this.provider.store.projectMembers.push({
          id: crypto.randomUUID(),
          projectId,
          userId,
          role: "owner",
          createdAt: isoNow()
        })
      }
      return
    }

    const { error } = await this.provider.client.from("project_members").upsert({
      project_id: projectId,
      user_id: userId,
      role: "owner"
    })

    if (error) throw error
  }
}
