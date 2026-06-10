import type { Viewer } from "@/server/policies/viewer"
import {
  consumeActionQuota,
  consumeExtensionMemoryWriteQuota,
  consumeMcpWriteQuota,
} from "@/server/services/entitlement-service"

export async function chargeViewerWriteQuota(viewer: Viewer, amount = 1) {
  if (viewer.mode === "mcp") {
    await consumeMcpWriteQuota(viewer.userId, amount)
  } else if (viewer.mode === "extension") {
    await consumeExtensionMemoryWriteQuota(viewer.userId, amount)
  } else {
    await consumeActionQuota(viewer.userId, "write", amount)
  }
}