import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Relay — Cross-AI Context Management for Developers",
  description:
    "Relay captures decisions, tasks, and constraints from your AI chats and keeps a living project brief synced across ChatGPT, Claude, Gemini, Cursor, Claude Code, and 20+ other tools via MCP.",
  robots: "index, follow",
}

export default function MachinePage() {
  return (
    <div style={{ backgroundColor: "#0a0a0a", minHeight: "100vh" }}>
    <div
      style={{
        fontFamily:
          "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, monospace",
        maxWidth: 720,
        margin: "0 auto",
        padding: "2.5rem 2rem",
        lineHeight: 1.75,
        color: "#b0b0b0",
      }}
    >
      {/* Top bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: "1.5rem",
          marginBottom: "2.5rem",
          paddingBottom: "1.5rem",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}
      >
        <a
          href="/"
          style={{
            fontSize: "0.75rem",
            color: "#666",
            textDecoration: "none",
            letterSpacing: "0.05em",
          }}
        >
          ○ HUMAN
        </a>
        <span
          style={{
            fontSize: "0.75rem",
            color: "#ccc",
            padding: "0.15rem 0.6rem",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: "4px",
            letterSpacing: "0.05em",
          }}
        >
          ■ MACHINE
        </span>
      </div>

      <h1
        style={{
          fontSize: "1.1rem",
          fontWeight: 600,
          color: "#e0e0e0",
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          marginBottom: "0.75rem",
        }}
      >
        Relay: Cross-AI Context Management
      </h1>
      <p style={{ fontSize: "0.9rem", color: "#888" }}>
        Relay is a Chrome extension and MCP server that captures what matters
        from your AI conversations — decisions, tasks, and constraints — and
        builds a living project brief that stays synced across every tool you
        use. Stop re-explaining context in every new chat.
      </p>

      <h2
        style={{
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "#ccc",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginTop: "2.5rem",
          marginBottom: "0.75rem",
        }}
      >
        # What Relay Does
      </h2>
      <p style={{ fontSize: "0.85rem" }}>
        <strong style={{ color: "#ccc" }}>Auto-capture:</strong> Relay monitors
        your AI chat sessions (with your permission) and automatically extracts
        structured information — decisions made, tasks identified, and
        constraints established. No manual note-taking required.
      </p>
      <p style={{ fontSize: "0.85rem" }}>
        <strong style={{ color: "#ccc" }}>Living Project Briefs:</strong>{" "}
        Extracted context is organized into project briefs that update
        themselves as you continue working.
      </p>
      <p style={{ fontSize: "0.85rem" }}>
        <strong style={{ color: "#ccc" }}>One-Click Context Injection:</strong>{" "}
        When you open a fresh AI chat, insert your project brief with one
        click. The new conversation starts with full context.
      </p>
      <p style={{ fontSize: "0.85rem" }}>
        <strong style={{ color: "#ccc" }}>Cross-Surface Sync:</strong> Context
        captured in a browser chat is instantly available to your IDE coding
        agent via MCP, and vice versa.
      </p>

      <h2
        style={{
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "#ccc",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginTop: "2.5rem",
          marginBottom: "0.75rem",
        }}
      >
        # Supported AI Tools
      </h2>
      <p
        style={{
          fontSize: "0.8rem",
          color: "#777",
          marginBottom: "0.25rem",
        }}
      >
        Browser (via Chrome Extension):
      </p>
      <p style={{ fontSize: "0.85rem" }}>
        ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek
      </p>
      <p
        style={{
          fontSize: "0.8rem",
          color: "#777",
          marginTop: "1rem",
          marginBottom: "0.25rem",
        }}
      >
        IDE Agents (via MCP):
      </p>
      <p style={{ fontSize: "0.85rem" }}>
        Claude Code, Cursor, Codex, Windsurf, OpenCode, Gemini CLI, VS Code
        (Copilot), Trae, Antigravity, Zed, Continue, Aider, Amp, Void, Cline,
        Roo Code, Augment, Kilo Code, Copilot CLI, Amazon Q, and any other
        MCP-compatible agent
      </p>

      <h2
        style={{
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "#ccc",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginTop: "2.5rem",
          marginBottom: "0.75rem",
        }}
      >
        # MCP Integration
      </h2>
      <p style={{ fontSize: "0.85rem" }}>
        MCP (Model Context Protocol) is an open standard by Anthropic that
        allows AI agents to read and write structured data. Relay implements an
        MCP server bridging browser sessions with IDE agents.
      </p>
      <div
        style={{
          margin: "1rem 0",
          padding: "0.75rem 1rem",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: "8px",
          backgroundColor: "rgba(255,255,255,0.02)",
        }}
      >
        <code style={{ fontSize: "0.85rem", color: "#ccc" }}>
          $ npx @anthropic-ai/relay install
        </code>
      </div>

      <h2
        style={{
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "#ccc",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginTop: "2.5rem",
          marginBottom: "0.75rem",
        }}
      >
        # Pricing
      </h2>
      <p style={{ fontSize: "0.85rem" }}>
        <strong style={{ color: "#ccc" }}>Free — $0/forever:</strong> Up to 2
        active projects, Standard brief depth, MCP access (read), 7-day
        history retention, Browser capture.
      </p>
      <p style={{ fontSize: "0.85rem" }}>
        <strong style={{ color: "#ccc" }}>Pro — $9/month ($90/year):</strong>{" "}
        Unlimited projects, Deep brief with full history, Full MCP access
        (read + write), 90-day history retention, All capture surfaces,
        Handoff packs, Referral program.
      </p>

      <h2
        style={{
          fontSize: "0.85rem",
          fontWeight: 600,
          color: "#ccc",
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginTop: "2.5rem",
          marginBottom: "0.75rem",
        }}
      >
        # Frequently Asked Questions
      </h2>
      <dl>
        {[
          [
            "What does Relay actually save?",
            "Decisions, tasks, and constraints extracted from your chat — not the full transcript.",
          ],
          [
            "Which AI tools does Relay work with?",
            "Browser: ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek. IDE agents via MCP: Claude Code, Cursor, Codex, Windsurf, and 20+ others.",
          ],
          [
            "What is MCP?",
            "An open standard for giving AI agents access to structured data. Relay runs an MCP server so your IDE agent can read and write your project brief.",
          ],
          [
            "Is my data private?",
            "Stored in your encrypted Relay account. You choose which chats are tracked. Delete anytime.",
          ],
          [
            "Is Relay free?",
            "Yes. Free plan supports 2 projects. Pro is $9/month for unlimited.",
          ],
          [
            "Do I need to change how I work?",
            "No. Install the extension, associate a chat with a project, and Relay does the rest.",
          ],
        ].map(([q, a]) => (
          <div key={q} style={{ marginBottom: "1rem" }}>
            <dt
              style={{
                fontSize: "0.85rem",
                fontWeight: 600,
                color: "#ccc",
              }}
            >
              {q}
            </dt>
            <dd
              style={{
                fontSize: "0.85rem",
                margin: "0.25rem 0 0 0",
                color: "#888",
              }}
            >
              {a}
            </dd>
          </div>
        ))}
      </dl>

      <div
        style={{
          marginTop: "3rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          fontSize: "0.8rem",
          color: "#555",
        }}
      >
        <p>
          Website:{" "}
          <a
            href="https://relay-flow.vercel.app"
            style={{ color: "#888", textDecoration: "underline" }}
          >
            relay-flow.vercel.app
          </a>
        </p>
      </div>
    </div>
    </div>
  )
}
