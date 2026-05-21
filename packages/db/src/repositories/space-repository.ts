import type { DatabaseProvider } from "../store/provider"

export type SpaceKind = "personal" | "project"
export type SpaceMemberRole = "owner" | "admin" | "editor" | "member" | "viewer"

export interface SpaceRow {
  id: string
  kind: SpaceKind
  ownerId: string
  name: string
  projectId: string | null
  createdAt: string
  updatedAt: string
}

export interface SpaceMemberRow {
  id: string
  spaceId: string
  userId: string
  role: SpaceMemberRole
  createdAt: string
}

function toSpaceRow(row: Record<string, unknown>): SpaceRow {
  return {
    id: String(row.id),
    kind: String(row.kind) as SpaceKind,
    ownerId: String(row.owner_id),
    name: String(row.name),
    projectId: row.project_id ? String(row.project_id) : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

function toMemberRow(row: Record<string, unknown>): SpaceMemberRow {
  return {
    id: String(row.id),
    spaceId: String(row.space_id),
    userId: String(row.user_id),
    role: String(row.role) as SpaceMemberRole,
    createdAt: String(row.created_at),
  }
}

export class SpaceRepository {
  constructor(private readonly provider: DatabaseProvider) {}

  /**
   * Ensure a personal space exists for the user. Idempotent — safe to call
   * on every signup or session bootstrap. Returns the existing or newly
   * created space.
   */
  async ensurePersonalSpaceForUser(
    userId: string,
    displayName?: string | null,
  ): Promise<SpaceRow> {
    const existing = await this.provider.query(
      `SELECT * FROM spaces WHERE owner_id = $1 AND kind = 'personal' LIMIT 1`,
      [userId],
    )
    if (existing.length > 0) {
      return toSpaceRow(existing[0] as Record<string, unknown>)
    }
    const name = displayName?.trim() || "Personal"
    const inserted = await this.provider.query(
      `INSERT INTO spaces (kind, owner_id, name, project_id)
       VALUES ('personal', $1, $2, NULL)
       RETURNING *`,
      [userId, name],
    )
    const row = toSpaceRow(inserted[0] as Record<string, unknown>)
    await this.provider.query(
      `INSERT INTO space_members (space_id, user_id, role)
       VALUES ($1, $2, 'owner')
       ON CONFLICT (space_id, user_id) DO NOTHING`,
      [row.id, userId],
    )
    return row
  }

  /**
   * Ensure a project space exists for a project. Idempotent. The project
   * space inherits membership from project_members on first creation.
   */
  async ensureProjectSpace(projectId: string): Promise<SpaceRow> {
    const existing = await this.provider.query(
      `SELECT * FROM spaces WHERE project_id = $1 AND kind = 'project' LIMIT 1`,
      [projectId],
    )
    if (existing.length > 0) {
      return toSpaceRow(existing[0] as Record<string, unknown>)
    }
    const inserted = await this.provider.query(
      `INSERT INTO spaces (kind, owner_id, name, project_id)
       SELECT 'project', p.owner_id, p.name, p.id
       FROM projects p WHERE p.id = $1
       RETURNING *`,
      [projectId],
    )
    if (inserted.length === 0) {
      throw new Error(`Project ${projectId} not found when creating space`)
    }
    const row = toSpaceRow(inserted[0] as Record<string, unknown>)
    await this.provider.query(
      `INSERT INTO space_members (space_id, user_id, role, created_at)
       SELECT $1, pm.user_id,
         CASE WHEN $2 = pm.user_id THEN 'owner' ELSE COALESCE(pm.role::text, 'member') END,
         pm.created_at
       FROM project_members pm
       WHERE pm.project_id = $3
       ON CONFLICT (space_id, user_id) DO NOTHING`,
      [row.id, row.ownerId, projectId],
    )
    return row
  }

  async getById(spaceId: string): Promise<SpaceRow | null> {
    const rows = await this.provider.query(
      `SELECT * FROM spaces WHERE id = $1 LIMIT 1`,
      [spaceId],
    )
    return rows.length === 0 ? null : toSpaceRow(rows[0] as Record<string, unknown>)
  }

  async resolveSpaceForProject(projectId: string): Promise<SpaceRow | null> {
    const rows = await this.provider.query(
      `SELECT * FROM spaces WHERE project_id = $1 AND kind = 'project' LIMIT 1`,
      [projectId],
    )
    return rows.length === 0 ? null : toSpaceRow(rows[0] as Record<string, unknown>)
  }

  async getPersonalSpaceForUser(userId: string): Promise<SpaceRow | null> {
    const rows = await this.provider.query(
      `SELECT * FROM spaces WHERE owner_id = $1 AND kind = 'personal' LIMIT 1`,
      [userId],
    )
    return rows.length === 0 ? null : toSpaceRow(rows[0] as Record<string, unknown>)
  }

  async listSpacesForUser(userId: string): Promise<SpaceRow[]> {
    const rows = await this.provider.query(
      `SELECT s.*
       FROM spaces s
       JOIN space_members sm ON sm.space_id = s.id
       WHERE sm.user_id = $1
       ORDER BY
         CASE WHEN s.kind = 'personal' THEN 0 ELSE 1 END,
         s.updated_at DESC`,
      [userId],
    )
    return rows.map((r) => toSpaceRow(r as Record<string, unknown>))
  }

  async rename(spaceId: string, name: string): Promise<void> {
    await this.provider.query(
      `UPDATE spaces SET name = $1, updated_at = now() WHERE id = $2`,
      [name, spaceId],
    )
  }

  async listMembers(spaceId: string): Promise<SpaceMemberRow[]> {
    const rows = await this.provider.query(
      `SELECT * FROM space_members WHERE space_id = $1 ORDER BY created_at ASC`,
      [spaceId],
    )
    return rows.map((r) => toMemberRow(r as Record<string, unknown>))
  }

  async addMember(
    spaceId: string,
    userId: string,
    role: SpaceMemberRole = "member",
  ): Promise<SpaceMemberRow> {
    const rows = await this.provider.query(
      `INSERT INTO space_members (space_id, user_id, role)
       VALUES ($1, $2, $3)
       ON CONFLICT (space_id, user_id) DO UPDATE SET role = EXCLUDED.role
       RETURNING *`,
      [spaceId, userId, role],
    )
    return toMemberRow(rows[0] as Record<string, unknown>)
  }

  async removeMember(spaceId: string, userId: string): Promise<void> {
    await this.provider.query(
      `DELETE FROM space_members WHERE space_id = $1 AND user_id = $2`,
      [spaceId, userId],
    )
  }
}
