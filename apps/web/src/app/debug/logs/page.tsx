import { DebugLogsScreen, type DebugLogFilters } from "@/components/debug/debug-logs-screen"

export const dynamic = "force-dynamic"

function getSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? ""
}

export default async function DebugLogsPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const params = await searchParams
  const parsedLimit = Number(getSingleParam(params.limit) || "100")

  const filters: DebugLogFilters = {
    surface: (getSingleParam(params.surface) as DebugLogFilters["surface"] | "") || undefined,
    requestId: getSingleParam(params.requestId) || undefined,
    flowId: getSingleParam(params.flowId) || undefined,
    userId: getSingleParam(params.userId) || undefined,
    projectId: getSingleParam(params.projectId) || undefined,
    level: (getSingleParam(params.level) as DebugLogFilters["level"] | "") || undefined,
    limit: Number.isFinite(parsedLimit) ? parsedLimit : 100
  }

  return <DebugLogsScreen initialFilters={filters} />
}
