import { ControlPanel } from "./src/components/control-panel"
import { ExtensionChat } from "./src/components/extension-chat"

export default function SidePanel() {
  return (
    <div
      style={{
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
