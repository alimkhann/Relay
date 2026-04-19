import { applyEdits, modify, parse } from "jsonc-parser"

export type JsoncPath = Array<string | number>

export interface JsoncEdit {
  path: JsoncPath
  value: unknown
}

function normalizeRawJsonc(raw: string) {
  return raw.trim().length > 0 ? raw : "{}\n"
}

function detectFormatting(raw: string) {
  const eol = raw.includes("\r\n") ? "\r\n" : "\n"
  const indentMatch = raw.match(/^( +|\t+)(?=\S)/m)?.[1] ?? "  "

  if (indentMatch.includes("\t")) {
    return { insertSpaces: false, tabSize: 1, eol }
  }

  return { insertSpaces: true, tabSize: Math.max(2, indentMatch.length), eol }
}

export function parseJsonc<T>(raw: string): T {
  return parse(normalizeRawJsonc(raw)) as T
}

export function applyJsoncEdits(raw: string, edits: JsoncEdit[]) {
  let next = normalizeRawJsonc(raw)
  const formattingOptions = detectFormatting(next)

  for (const edit of edits) {
    const jsonEdits = modify(next, edit.path, edit.value, {
      formattingOptions,
      getInsertionIndex: undefined,
    })
    next = applyEdits(next, jsonEdits)
  }

  const changed = next !== normalizeRawJsonc(raw)
  return {
    text: next.endsWith(formattingOptions.eol) ? next : `${next}${formattingOptions.eol}`,
    changed,
  }
}
