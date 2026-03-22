import type { MemoryItemType } from "@relay/shared"

import type { GraphEdgeType } from "./types"

/** Node colors by memory item type */
export const NODE_COLORS: Record<MemoryItemType, string> = {
  decision: "#3b82f6",    // blue-500
  task: "#f59e0b",        // amber-500
  constraint: "#ef4444",  // red-500
  note: "#6b7280",        // gray-500
  artifact: "#10b981",    // emerald-500
  requirement: "#8b5cf6", // violet-500
}

/** Edge colors by relation type */
export const EDGE_COLORS: Record<GraphEdgeType, string> = {
  supersedes: "#ef4444",  // red
  extends: "#3b82f6",     // blue
  derives: "#9ca3af",     // gray
  similar: "#d1d5db",     // light gray
}

/** Edge is dashed for similarity, solid for explicit */
export const EDGE_DASHED: Record<GraphEdgeType, boolean> = {
  supersedes: false,
  extends: false,
  derives: false,
  similar: true,
}

/** D3-force simulation config */
export const SIMULATION = {
  /** Repulsion strength between nodes */
  chargeStrength: -300,
  /** Maximum repulsion distance */
  chargeDistanceMax: 400,
  /** Link distance (edge length) */
  linkDistance: 120,
  /** Link strength multiplier for explicit relations */
  linkStrengthExplicit: 0.8,
  /** Link strength multiplier for similarity edges */
  linkStrengthSimilar: 0.2,
  /** Center gravity strength */
  centerStrength: 0.05,
  /** Collision radius padding */
  collisionPadding: 8,
  /** Velocity decay */
  velocityDecay: 0.4,
  /** Alpha decay rate */
  alphaDecay: 0.02,
  /** Minimum alpha before simulation stops */
  alphaMin: 0.001,
}

/** Node sizing */
export const NODE_SIZE = {
  /** Minimum radius */
  minRadius: 6,
  /** Maximum radius */
  maxRadius: 20,
  /** Radius per connection */
  radiusPerConnection: 1.5,
  /** Pin icon size */
  pinIconSize: 8,
  /** Selection ring width */
  selectionRingWidth: 3,
}

/** Canvas rendering */
export const CANVAS = {
  /** Background color */
  bgColor: "var(--relay-bg)",
  /** Default zoom */
  defaultZoom: 1,
  /** Minimum zoom */
  minZoom: 0.1,
  /** Maximum zoom */
  maxZoom: 4,
  /** Pan friction */
  panFriction: 0.9,
}

export const TYPE_LABELS: Record<MemoryItemType, string> = {
  decision: "Decision",
  task: "Task",
  constraint: "Constraint",
  note: "Note",
  artifact: "Artifact",
  requirement: "Requirement",
}
