import { Pool, type QueryResultRow } from "@neondatabase/serverless"

export interface DatabaseProvider {
  mode: "neon"
  query<T extends QueryResultRow = QueryResultRow>(text: string, values?: unknown[]): Promise<T[]>
}

let pool: Pool | null = null

function getPool() {
  const connectionString = process.env.DATABASE_URL

  if (!connectionString) {
    throw new Error("DATABASE_URL is required.")
  }

  if (!pool) {
    pool = new Pool({
      connectionString,
      max: 4
    })
  }

  return pool
}

export function createRepositoryProvider(viewerUserId?: string): DatabaseProvider {
  const database = getPool()

  return {
    mode: "neon",
    async query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
      const client = await database.connect()

      try {
        if (viewerUserId) {
          await client.query("select set_config('relay.current_user_id', $1, true)", [viewerUserId])
        }

        const result = await client.query<T>(text, values)
        return result.rows
      } finally {
        client.release()
      }
    }
  }
}
