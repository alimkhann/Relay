export default function ExtensionDocsPage() {
  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--relay-ink)]">Chrome Extension</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-[var(--relay-muted)]">
          The Relay Chrome extension watches your AI chats and automatically captures decisions,
          tasks, constraints, and context into your project memory.
        </p>
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">Supported platforms</h2>
        <div className="divide-y divide-[var(--relay-line)] rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
          {[
            { name: "ChatGPT", domain: "chatgpt.com" },
            { name: "Claude", domain: "claude.ai" },
            { name: "Gemini", domain: "gemini.google.com" },
            { name: "Perplexity", domain: "perplexity.ai" },
            { name: "Grok", domain: "grok.x.ai" },
            { name: "DeepSeek", domain: "chat.deepseek.com" },
            { name: "Codex", domain: "chatgpt.com/codex" },
          ].map((p) => (
            <div key={p.name} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-[14px] font-medium text-[var(--relay-ink)]">{p.name}</span>
              <code className="text-[12px] font-mono text-[var(--relay-muted)]">{p.domain}</code>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">Installation</h2>
        <ol className="list-decimal list-inside space-y-2 text-[15px] text-[var(--relay-muted)]">
          <li>Install the extension from the Chrome Web Store (coming soon during beta).</li>
          <li>Click the Relay icon in your browser toolbar to open the side panel.</li>
          <li>Sign in with the same account you use on onrelay.app.</li>
          <li>The extension will start capturing context from supported AI chats automatically.</li>
        </ol>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">How capture works</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          When you chat on a supported platform, the extension observes the conversation DOM and
          extracts structured information: decisions, tasks, constraints, and important context.
          This data is sent to Relay&apos;s backend where it&apos;s merged with your project memory using
          truth-scored governance.
        </p>
        <p className="text-[15px] text-[var(--relay-muted)]">
          Capture is per-project — the extension uses your active project selection to route
          context to the correct project.
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--relay-ink)]">Settings</h2>
        <p className="text-[15px] text-[var(--relay-muted)]">
          You can customize extension behavior in your{" "}
          <a href="/settings" className="text-[var(--relay-accent)] underline underline-offset-2">
            dashboard settings
          </a>:
        </p>
        <ul className="list-disc list-inside space-y-1.5 text-[15px] text-[var(--relay-muted)]">
          <li><strong className="text-[var(--relay-ink)]">Auto-capture</strong> — Toggle automatic context extraction on/off.</li>
          <li><strong className="text-[var(--relay-ink)]">Platforms</strong> — Enable or disable capture per AI platform.</li>
          <li><strong className="text-[var(--relay-ink)]">Inline chip</strong> — Show a brief-insert chip when you start a new chat.</li>
        </ul>
      </section>
    </div>
  )
}
