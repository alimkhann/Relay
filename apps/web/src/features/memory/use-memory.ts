"use client"

// Memory reads the shared project dashboard query (same payload as Brief and
// Dashboard tabs) so cross-tab navigation is instant.
export { useProjectDashboard as useMemory } from "@/features/projects/use-project-dashboard"
