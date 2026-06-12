export type DocsFrom = "landing" | "dashboard"

export function docsHref(from: DocsFrom, project?: string | null) {
  const params = new URLSearchParams({ from })
  if (project) params.set("project", project)
  return `/docs?${params.toString()}`
}

export function resolveDocsBackLink(from: string | null, project: string | null) {
  if (from === "landing") {
    return { label: "Back to home", href: "/" }
  }
  if (from === "dashboard" || project) {
    return {
      label: "Back to dashboard",
      href: project ? `/dashboard?project=${encodeURIComponent(project)}` : "/dashboard",
    }
  }
  return { label: "Back to home", href: "/" }
}