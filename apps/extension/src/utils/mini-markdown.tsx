import { Fragment, type ReactNode } from "react"

/**
 * Tiny, dependency-free, XSS-safe markdown renderer for the extension chat.
 * Text is never injected as HTML — we build React nodes from a small grammar
 * (headings, bold, italic, inline code, fenced code, links, lists). Anything
 * unrecognised renders as plain text.
 */

function renderInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = []
  const pattern =
    /(`[^`]+`)|(\[[^\]]+\]\((?:https?:\/\/|mailto:)[^\s)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)/
  let rest = text
  let i = 0
  while (rest.length > 0) {
    const m = rest.match(pattern)
    if (!m || m.index === undefined || m[0] === undefined) {
      out.push(<Fragment key={`${keyBase}-t${i}`}>{rest}</Fragment>)
      break
    }
    if (m.index > 0) {
      out.push(<Fragment key={`${keyBase}-t${i}`}>{rest.slice(0, m.index)}</Fragment>)
    }
    const tok = m[0]
    const k = `${keyBase}-m${i}`
    if (tok.startsWith("`")) {
      out.push(<code key={k}>{tok.slice(1, -1)}</code>)
    } else if (tok.startsWith("[")) {
      const lm = tok.match(/\[([^\]]+)\]\(([^\s)]+)\)/)
      out.push(
        lm && lm[1] && lm[2] ? (
          <a key={k} href={lm[2]} target="_blank" rel="noreferrer noopener">
            {lm[1]}
          </a>
        ) : (
          <Fragment key={k}>{tok}</Fragment>
        )
      )
    } else if (tok.startsWith("**")) {
      out.push(<strong key={k}>{tok.slice(2, -2)}</strong>)
    } else {
      out.push(<em key={k}>{tok.slice(1, -1)}</em>)
    }
    rest = rest.slice(m.index + tok.length)
    i += 1
  }
  return out
}

export function MiniMarkdown({ text }: { text: string }): ReactNode {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const blocks: ReactNode[] = []
  let i = 0
  let key = 0
  const at = (idx: number) => lines[idx] ?? ""

  while (i < lines.length) {
    const line = at(i)

    if (line.trim().startsWith("```")) {
      const buf: string[] = []
      i += 1
      while (i < lines.length && !at(i).trim().startsWith("```")) {
        buf.push(at(i))
        i += 1
      }
      i += 1
      blocks.push(
        <pre key={`b${key++}`}>
          <code>{buf.join("\n")}</code>
        </pre>
      )
      continue
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/)
    if (heading && heading[1] && heading[2] !== undefined) {
      const level = heading[1].length
      const Tag = `h${Math.min(level + 2, 6)}` as "h3" | "h4" | "h5" | "h6"
      blocks.push(<Tag key={`b${key++}`}>{renderInline(heading[2], `b${key}`)}</Tag>)
      i += 1
      continue
    }

    if (/^\s*[-*]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line)
      const items: ReactNode[] = []
      while (i < lines.length && (/^\s*[-*]\s+/.test(at(i)) || /^\s*\d+\.\s+/.test(at(i)))) {
        const content = at(i).replace(/^\s*(?:[-*]|\d+\.)\s+/, "")
        items.push(<li key={`li${key}-${i}`}>{renderInline(content, `li${key}-${i}`)}</li>)
        i += 1
      }
      blocks.push(
        ordered ? <ol key={`b${key++}`}>{items}</ol> : <ul key={`b${key++}`}>{items}</ul>
      )
      continue
    }

    if (line.trim() === "") {
      i += 1
      continue
    }

    const para: string[] = []
    while (
      i < lines.length &&
      at(i).trim() !== "" &&
      !at(i).trim().startsWith("```") &&
      !at(i).match(/^(#{1,4})\s+/) &&
      !/^\s*[-*]\s+/.test(at(i)) &&
      !/^\s*\d+\.\s+/.test(at(i))
    ) {
      para.push(at(i))
      i += 1
    }
    blocks.push(
      <p key={`b${key++}`}>
        {para.flatMap((p, idx) => {
          const nodes = renderInline(p, `b${key}-${idx}`)
          return idx < para.length - 1 ? [...nodes, <br key={`br${key}-${idx}`} />] : nodes
        })}
      </p>
    )
  }

  return <>{blocks}</>
}
