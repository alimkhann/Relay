import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

import { cn } from "@/lib/cn";

// Compact dark-theme markdown renderer. Callers own the wrapper's base color,
// font size and any max-height/overflow; this only styles block elements so
// briefs and promoted notes stop rendering as raw `#`/`**`/`-` text.
const components: Components = {
  p: ({ children }) => <p className="my-1.5 leading-relaxed">{children}</p>,
  h1: ({ children }) => (
    <h1 className="mb-1.5 mt-3 text-[15px] font-semibold text-[var(--relay-ink)] first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1.5 mt-3 text-[14px] font-semibold text-[var(--relay-ink)] first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-2.5 text-[13px] font-semibold text-[var(--relay-ink)] first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-2 text-[12px] font-semibold text-[var(--relay-ink)] first:mt-0">{children}</h4>
  ),
  ul: ({ children }) => <ul className="my-1.5 list-disc space-y-0.5 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 list-decimal space-y-0.5 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-[var(--relay-accent)] underline underline-offset-2 hover:opacity-80"
    >
      {children}
    </a>
  ),
  strong: ({ children }) => <strong className="font-semibold text-[var(--relay-ink)]">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ className: codeClass, children }) => {
    const isBlock = /language-/.test(codeClass ?? "");
    if (isBlock) {
      return <code className="font-mono text-[11px]">{children}</code>;
    }
    return (
      <code className="rounded bg-[var(--relay-soft)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--relay-ink)]">
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded-[var(--relay-radius-sm)] border border-[var(--relay-line)] bg-[var(--relay-bg)] p-3">
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-[var(--relay-line)] pl-3 text-[var(--relay-muted)]">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-[var(--relay-line)]" />,
  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="w-full border-collapse text-left">{children}</table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-[var(--relay-line)] px-2 py-1 font-semibold text-[var(--relay-ink)]">{children}</th>
  ),
  td: ({ children }) => (
    <td className="border border-[var(--relay-line)] px-2 py-1 align-top">{children}</td>
  ),
};

export function Markdown({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("[&>*:first-child]:mt-0 [&>*:last-child]:mb-0", className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
