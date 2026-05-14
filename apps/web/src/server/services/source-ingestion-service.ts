import { createHash } from "node:crypto"

import { BadRequestError } from "@/server/http/errors"

const SUPPORTED_BY_EXTENSION = new Map<string, { mimeTypes: string[]; format: string }>([
  ["md", { mimeTypes: ["text/markdown", "text/plain"], format: "markdown" }],
  ["txt", { mimeTypes: ["text/plain"], format: "text" }],
  ["csv", { mimeTypes: ["text/csv", "text/plain"], format: "csv" }],
  ["tsv", { mimeTypes: ["text/tab-separated-values", "text/plain"], format: "tsv" }],
  ["docx", { mimeTypes: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"], format: "docx" }],
  ["xlsx", { mimeTypes: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"], format: "xlsx" }],
  ["pdf", { mimeTypes: ["application/pdf"], format: "pdf" }],
])

export interface ValidatedSourceFile {
  fileName: string
  mimeType: string
  byteSize: number
  extension: string
  format: string
}

export interface ExtractedSourceText {
  text: string
  metadata: Record<string, unknown>
}

export interface SourceChunkDraft {
  sourceId: string
  versionId: string
  chunkIndex: number
  content: string
  tokenEstimate: number
  locator: Record<string, unknown>
  metadata: Record<string, unknown>
}

export function getSourceFileExtension(fileName: string) {
  const clean = fileName.toLowerCase().split(/[?#]/)[0] ?? fileName.toLowerCase()
  const part = clean.split(".").pop()
  return part && part !== clean ? part.replace(/[^a-z0-9]/g, "") : ""
}

export function validateSourceFile(input: {
  fileName: string
  mimeType: string
  byteSize: number
  maxBytes: number
}): ValidatedSourceFile {
  if (input.byteSize <= 0) throw new BadRequestError("Source file is empty.")
  if (input.byteSize > input.maxBytes) throw new BadRequestError("Source file exceeds your current plan limit.")
  const extension = getSourceFileExtension(input.fileName)
  const support = SUPPORTED_BY_EXTENSION.get(extension)
  if (!support) {
    throw new BadRequestError("This source file type is not supported in v1.")
  }
  if (input.mimeType && !support.mimeTypes.includes(input.mimeType)) {
    throw new BadRequestError("This source file MIME type is not supported.")
  }
  return {
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    extension,
    format: support.format,
  }
}

function normalizeExtractedText(value: string) {
  return value.replace(/\r\n/g, "\n").replace(/\u0000/g, "").trim()
}

async function extractDocx(buffer: Buffer) {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

async function extractXlsx(buffer: Buffer) {
  const XLSX = await import("xlsx")
  const workbook = XLSX.read(buffer, { type: "buffer", cellFormula: false, cellHTML: false })
  const sections: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    if (csv.trim()) sections.push(`Sheet: ${sheetName}\n${csv}`)
  }
  return sections.join("\n\n")
}

async function extractPdf(buffer: Buffer) {
  const imported = await import("pdf-parse")
  const parse = imported as unknown as (input: Buffer) => Promise<{ text: string; numpages?: number }>
  const result = await parse(buffer)
  return {
    text: result.text,
    pages: result.numpages ?? null,
  }
}

export async function extractTextFromSourceBuffer(input: {
  buffer: Buffer
  fileName: string
  mimeType: string
}): Promise<ExtractedSourceText> {
  const validated = validateSourceFile({
    fileName: input.fileName,
    mimeType: input.mimeType,
    byteSize: input.buffer.byteLength,
    maxBytes: Number.MAX_SAFE_INTEGER,
  })

  if (["md", "txt", "csv", "tsv"].includes(validated.extension)) {
    return {
      text: normalizeExtractedText(input.buffer.toString("utf8")),
      metadata: { format: validated.format },
    }
  }

  if (validated.extension === "docx") {
    return { text: normalizeExtractedText(await extractDocx(input.buffer)), metadata: { format: "docx" } }
  }

  if (validated.extension === "xlsx") {
    return { text: normalizeExtractedText(await extractXlsx(input.buffer)), metadata: { format: "xlsx" } }
  }

  if (validated.extension === "pdf") {
    const pdf = await extractPdf(input.buffer)
    return { text: normalizeExtractedText(pdf.text), metadata: { format: "pdf", pages: pdf.pages } }
  }

  throw new BadRequestError("This source file type is not supported in v1.")
}

export function estimateTokens(text: string) {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function sha256Hex(bufferOrText: Buffer | string) {
  return createHash("sha256").update(bufferOrText).digest("hex")
}

export function chunkExtractedText(text: string, input: {
  sourceId: string
  versionId: string
  maxChars?: number
}): SourceChunkDraft[] {
  const maxChars = input.maxChars ?? 3_200
  const paragraphs = normalizeExtractedText(text).split(/\n{2,}/).filter(Boolean)
  const chunks: string[] = []
  let current = ""

  for (const paragraph of paragraphs) {
    if (!current) {
      current = paragraph
      continue
    }
    if (`${current}\n\n${paragraph}`.length <= maxChars) {
      current = `${current}\n\n${paragraph}`
    } else {
      chunks.push(current)
      current = paragraph
    }
  }
  if (current) chunks.push(current)

  return chunks.flatMap((chunk) => {
    if (chunk.length <= maxChars) return [chunk]
    const split: string[] = []
    for (let i = 0; i < chunk.length; i += maxChars) {
      split.push(chunk.slice(i, i + maxChars))
    }
    return split
  }).map((content, chunkIndex) => ({
    sourceId: input.sourceId,
    versionId: input.versionId,
    chunkIndex,
    content,
    tokenEstimate: estimateTokens(content),
    locator: { chunkIndex },
    metadata: { charLength: content.length },
  }))
}

export function extractFactCandidatesFromChunks(chunks: Array<{ id?: string; content: string; sourceId: string; versionId: string }>, projectId: string) {
  return chunks
    .map((chunk) => {
      const firstSentence = chunk.content.split(/(?<=[.!?])\s+/).find((part) => part.trim().length >= 24)
      if (!firstSentence) return null
      const content = firstSentence.trim().slice(0, 800)
      const confidence = /\b(must|will|uses|stores|requires|decided|chosen|default|limit|constraint)\b/i.test(content)
        ? 0.92
        : 0.74
      return {
        projectId,
        sourceId: chunk.sourceId,
        versionId: chunk.versionId,
        chunkId: chunk.id ?? null,
        type: confidence >= 0.9 ? "requirement" as const : "note" as const,
        title: content.slice(0, 80),
        content,
        confidence,
        metadata: { extractor: "heuristic-v1" },
      }
    })
    .filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate))
}
