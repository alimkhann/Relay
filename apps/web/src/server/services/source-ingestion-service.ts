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

export interface ExternalSourceText extends ExtractedSourceText {
  canonicalUrl: string
  displayName: string
  mimeType: string
  byteSize: number
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

const PRIVATE_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^0\./,
  /^169\.254\./,
  /^::1$/i,
]

function isBlockedExternalHost(hostname: string) {
  const host = hostname.replace(/^\[|\]$/g, "")
  return PRIVATE_HOST_PATTERNS.some((pattern) => pattern.test(host))
}

export function normalizeExternalSourceUrl(value: string) {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new BadRequestError("External sources require a valid public URL.")
  }
  if (isBlockedExternalHost(url.hostname)) {
    throw new BadRequestError("External sources require a public URL.")
  }
  if (url.protocol !== "https:") {
    throw new BadRequestError("External sources require a public https URL.")
  }
  url.hash = ""
  url.hostname = url.hostname.toLowerCase()
  if (url.pathname !== "/" && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1)
  }
  return url.toString()
}

export function classifyExternalSourceUrl(value: string) {
  const url = new URL(normalizeExternalSourceUrl(value))
  const path = url.pathname.toLowerCase()
  if (url.hostname === "arxiv.org" && /^\/(abs|pdf)\//.test(path)) return "arxiv" as const
  if (path.endsWith(".pdf")) return "pdf" as const
  if (path.endsWith("/llms.txt") || path.endsWith("llms.txt")) return "llms_txt" as const
  if (/openapi\.(json|ya?ml)$/.test(path) || /swagger\.(json|ya?ml)$/.test(path)) return "openapi" as const
  return "website" as const
}

export function validateSourceFile(input: {
  fileName: string
  mimeType?: string | null
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
  if (input.mimeType != null && !support.mimeTypes.includes(input.mimeType)) {
    throw new BadRequestError("This source file MIME type is not supported.")
  }
  return {
    fileName: input.fileName,
    mimeType: input.mimeType ?? support.mimeTypes[0]!,
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

function stripHtmlToText(html: string) {
  return normalizeExtractedText(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, "\"")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n"),
  )
}

function displayNameFromUrl(value: string) {
  const url = new URL(value)
  const last = url.pathname.split("/").filter(Boolean).pop()
  return decodeURIComponent(last || url.hostname).slice(0, 255)
}

export async function fetchExternalSourceText(inputUrl: string, options: {
  fetcher?: typeof fetch
  maxBytes?: number
  maxRedirects?: number
} = {}): Promise<ExternalSourceText> {
  let url = normalizeExternalSourceUrl(inputUrl)
  const fetcher = options.fetcher ?? fetch
  const maxBytes = options.maxBytes ?? 5 * 1024 * 1024
  const maxRedirects = options.maxRedirects ?? 3

  let response: Response | null = null
  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
    response = await fetcher(url, {
      headers: { accept: "text/html,text/plain,text/markdown,application/pdf,application/json,application/yaml,text/yaml,*/*;q=0.2" },
      redirect: "manual",
    })
    if (![301, 302, 303, 307, 308].includes(response.status)) break
    const location = response.headers.get("location")
    if (!location) throw new BadRequestError("External source redirected without a location.")
    url = normalizeExternalSourceUrl(new URL(location, url).toString())
  }

  if (!response) throw new BadRequestError("External source could not be fetched.")
  if (!response.ok) throw new BadRequestError(`External source returned HTTP ${response.status}.`)

  const contentLength = Number(response.headers.get("content-length") ?? 0)
  if (contentLength > maxBytes) throw new BadRequestError("External source exceeds the current fetch size limit.")

  const mimeType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() || "text/plain"
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)
  if (buffer.byteLength > maxBytes) throw new BadRequestError("External source exceeds the current fetch size limit.")

  const sourceType = classifyExternalSourceUrl(url)
  let text = ""
  const metadata: Record<string, unknown> = { sourceType, fetcher: "relay-native-v1" }
  if (mimeType === "application/pdf" || sourceType === "pdf" || sourceType === "arxiv") {
    const extracted = await extractTextFromSourceBuffer({
      buffer,
      fileName: sourceType === "arxiv" ? "arxiv.pdf" : displayNameFromUrl(url),
      mimeType: "application/pdf",
    })
    text = extracted.text
    Object.assign(metadata, extracted.metadata)
  } else if (mimeType.includes("html")) {
    text = stripHtmlToText(buffer.toString("utf8"))
  } else {
    text = normalizeExtractedText(buffer.toString("utf8"))
  }

  if (!text) throw new BadRequestError("Relay could not extract text from this external source.")

  return {
    text,
    canonicalUrl: url,
    displayName: displayNameFromUrl(url),
    mimeType,
    byteSize: buffer.byteLength,
    metadata,
  }
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
