import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Relay — Cross-AI Context Management for Developers",
  description:
    "Relay captures decisions, tasks, and constraints from your AI chats and keeps a living project brief synced across ChatGPT, Claude, Gemini, Cursor, Claude Code, and 20+ other tools via MCP.",
  robots: "index, follow",
}

export default function MachinePage() {
  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, -apple-system, sans-serif",
          maxWidth: 800,
          margin: "0 auto",
          padding: "2rem",
          lineHeight: 1.7,
          color: "#222",
          backgroundColor: "#fff",
        }}
      >
        <p
          style={{
            fontSize: "0.8rem",
            color: "#999",
            borderBottom: "1px solid #eee",
            paddingBottom: "1rem",
            marginBottom: "2rem",
          }}
        >
          This is the machine-readable version of relay-flow.vercel.app,
          optimized for AI crawlers and search engines.{" "}
          <a href="/" style={{ color: "#666" }}>
            Visit the main site →
          </a>
        </p>

        <h1>Relay: Cross-AI Context Management</h1>
        <p>
          Relay is a Chrome extension and MCP server that captures what matters
          from your AI conversations — decisions, tasks, and constraints — and
          builds a living project brief that stays synced across every tool you
          use. Stop re-explaining context in every new chat.
        </p>

        <h2>What Relay Does</h2>
        <p>
          <strong>Auto-capture:</strong> Relay monitors your AI chat sessions
          (with your permission) and automatically extracts structured
          information — decisions made, tasks identified, and constraints
          established. No manual note-taking required.
        </p>
        <p>
          <strong>Living Project Briefs:</strong> Extracted context is organized
          into project briefs that update themselves as you continue working.
          Each brief contains the latest decisions, open tasks, and active
          constraints for a project.
        </p>
        <p>
          <strong>One-Click Context Injection:</strong> When you open a fresh AI
          chat, insert your project brief with one click. The new conversation
          starts with full context of where you left off.
        </p>
        <p>
          <strong>Cross-Surface Sync:</strong> Context captured in a browser
          chat (ChatGPT, Claude) is instantly available to your IDE coding agent
          (Cursor, Claude Code) via MCP, and vice versa.
        </p>

        <h2>Supported AI Tools</h2>
        <h3>Browser (via Chrome Extension)</h3>
        <ul>
          <li>ChatGPT (chat.openai.com)</li>
          <li>Claude (claude.ai)</li>
          <li>Gemini (gemini.google.com)</li>
          <li>Grok (grok.com)</li>
          <li>Perplexity (perplexity.ai)</li>
          <li>DeepSeek (chat.deepseek.com)</li>
        </ul>

        <h3>IDE Agents (via MCP — Model Context Protocol)</h3>
        <ul>
          <li>Claude Code</li>
          <li>Cursor</li>
          <li>Codex (OpenAI)</li>
          <li>Windsurf</li>
          <li>OpenCode</li>
          <li>Gemini CLI</li>
          <li>VS Code (GitHub Copilot)</li>
          <li>Trae</li>
          <li>Antigravity</li>
          <li>Zed</li>
          <li>Continue</li>
          <li>Aider</li>
          <li>Amp</li>
          <li>Void</li>
          <li>Cline</li>
          <li>Roo Code</li>
          <li>Augment</li>
          <li>Kilo Code</li>
          <li>Copilot CLI</li>
          <li>Amazon Q</li>
          <li>And any other MCP-compatible agent</li>
        </ul>

        <h2>MCP Integration</h2>
        <p>
          MCP (Model Context Protocol) is an open standard created by Anthropic
          that allows AI agents to read and write structured data from external
          sources. Relay implements an MCP server that bridges your browser chat
          sessions with your IDE coding agent.
        </p>
        <p>
          When your IDE agent (e.g., Claude Code, Cursor) connects to Relay via
          MCP, it can:
        </p>
        <ul>
          <li>Read your latest project brief</li>
          <li>Access decisions, tasks, and constraints</li>
          <li>Write back new decisions and progress</li>
          <li>Stay in sync with your browser sessions</li>
        </ul>
        <p>
          <strong>Install:</strong>{" "}
          <code>npx @anthropic-ai/relay install</code>
        </p>

        <h2>Pricing</h2>
        <h3>Free — $0/forever</h3>
        <ul>
          <li>Up to 2 active projects</li>
          <li>Standard brief depth</li>
          <li>MCP access (read)</li>
          <li>7-day history retention</li>
          <li>Browser capture</li>
        </ul>
        <h3>Pro — $9/month</h3>
        <ul>
          <li>Unlimited active projects</li>
          <li>Deep brief with full history</li>
          <li>Full MCP access (read + write)</li>
          <li>90-day history retention</li>
          <li>All capture surfaces</li>
          <li>Handoff packs (export/share briefs)</li>
          <li>Referral program</li>
        </ul>
        <p>
          <em>
            Pricing subject to change during beta. Early users keep their rate.
          </em>
        </p>

        <h2>Frequently Asked Questions</h2>
        <dl>
          <dt>
            <strong>What does Relay actually save?</strong>
          </dt>
          <dd>
            Decisions, tasks, and constraints extracted from your chat — not the
            full transcript. You control which chats are tracked and can delete
            any project and its data at any time.
          </dd>

          <dt>
            <strong>Which AI tools does Relay work with?</strong>
          </dt>
          <dd>
            Browser: ChatGPT, Claude, Gemini, Grok, Perplexity, DeepSeek. IDE
            agents via MCP: Claude Code, Cursor, Codex, Windsurf, and 20+
            others.
          </dd>

          <dt>
            <strong>What is MCP and how does Relay use it?</strong>
          </dt>
          <dd>
            MCP (Model Context Protocol) is an open standard for giving AI
            agents access to structured data. Relay runs an MCP server locally
            so your IDE agent can read and write your project brief directly.
          </dd>

          <dt>
            <strong>Is my data private?</strong>
          </dt>
          <dd>
            Your brief is stored in your Relay account (cloud, encrypted). You
            choose which chats are tracked. You can delete any project and its
            data at any time.
          </dd>

          <dt>
            <strong>Is Relay free?</strong>
          </dt>
          <dd>
            Yes. The Free plan supports up to 2 projects with no card required.
            Pro is $9/month for unlimited everything.
          </dd>

          <dt>
            <strong>Do I need to change how I work?</strong>
          </dt>
          <dd>
            No. Install the extension, associate a chat with a project, and
            Relay does the rest. MCP setup takes one command.
          </dd>
        </dl>

        <h2>About Relay</h2>
        <p>
          Relay was built for developers and AI power users who are tired of
          re-explaining project context in every new chat. Whether you&apos;re
          switching between ChatGPT and Claude, or moving from a browser
          conversation to your IDE coding agent, Relay ensures continuity.
        </p>
        <p>
          Website:{" "}
          <a href="https://relay-flow.vercel.app">
            https://relay-flow.vercel.app
          </a>
        </p>
      </body>
    </html>
  )
}
