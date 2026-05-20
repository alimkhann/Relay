import { ControlPanel } from "./src/components/control-panel"
import { ExtensionChat } from "./src/components/extension-chat"

export default function SidePanel() {
  // Wrap everything in a relative container so ExtensionChat's `modeFull`
  // overlay (position: absolute; inset: 0) covers the ControlPanel below it.
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden"
      }}
    >
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>
        <ControlPanel />
      </div>
      <ExtensionChat />
    </div>
  )
}
