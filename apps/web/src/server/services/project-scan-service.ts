import { isIP } from "node:net"

import { BadRequestError } from "@/server/http/errors"

const FETCH_TIMEOUT_MS = 5_000
const MAX_HTML_BYTES = 512_000
const MAX_NAME_LENGTH = 80
const MAX_DESCRIPTION_LENGTH = 200

export interface ProjectScanResult {
  name: string | null
  description: string | null
  url: string
}

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }

  const [first, second] = parts
  return (
    first === 10 ||
    first === 127 ||
    first === 0 ||
    (first === 169 && second === 254) ||
    (first === 172 && typeof second === "number" && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase()
  return (
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:")
  )
}

export function normalizeScannableProjectUrl(rawUrl: string) {
  let parsed: URL
  try {
    parsed = new URL(rawUrl.trim())
  } catch {
    throw new BadRequestError("Enter a valid project URL.")
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new BadRequestError("Project URL must start with http:// or https://.")
  }

  const hostname = parsed.hostname.toLowerCase()
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local")
  ) {
    throw new BadRequestError("Project URL must be a public website.")
  }

  const ipVersion = isIP(hostname)
  if ((ipVersion === 4 && isPrivateIpv4(hostname)) || (ipVersion === 6 && isPrivateIpv6(hostname))) {
    throw new BadRequestError("Project URL must be a public website.")
  }

  parsed.hash = ""
  return parsed.toString()
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, code: string) => decodeNumericEntity(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => decodeNumericEntity(Number.parseInt(code, 16)))
}

function decodeNumericEntity(codePoint: number) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) {
    return ""
  }
  return String.fromCodePoint(codePoint)
}

function cleanExtractedText(value: string | null | undefined, maxLength: number) {
  const normalized = decodeHtmlEntities(value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()

  if (!normalized) return null
  return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized
}

function parseAttributes(rawAttributes: string) {
  const attributes = new Map<string, string>()
  const attributePattern = /([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g
  let match: RegExpExecArray | null

  while ((match = attributePattern.exec(rawAttributes))) {
    const key = match[1]?.toLowerCase()
    const value = match[2] ?? match[3] ?? match[4] ?? ""
    if (key) attributes.set(key, value)
  }

  return attributes
}

function findMetaContent(html: string, names: string[]) {
  const wanted = new Set(names.map((name) => name.toLowerCase()))
  const metaPattern = /<meta\b([^>]*)>/gi
  let match: RegExpExecArray | null

  while ((match = metaPattern.exec(html))) {
    const attributes = parseAttributes(match[1] ?? "")
    const key = (attributes.get("property") ?? attributes.get("name") ?? "").toLowerCase()
    if (wanted.has(key)) {
      const content = cleanExtractedText(attributes.get("content"), key.includes("title") ? MAX_NAME_LENGTH : MAX_DESCRIPTION_LENGTH)
      if (content) return content
    }
  }

  return null
}

export function extractProjectMetadataFromHtml(html: string): Omit<ProjectScanResult, "url"> {
  const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(html)
  const title = cleanExtractedText(titleMatch?.[1], MAX_NAME_LENGTH)
  const ogTitle = findMetaContent(html, ["og:title"])
  const metaDescription = findMetaContent(html, ["description"])
  const ogDescription = findMetaContent(html, ["og:description"])

  return {
    name: ogTitle ?? title,
    description: ogDescription ?? metaDescription,
  }
}

async function readCappedHtml(response: Response) {
  if (!response.body) {
    return (await response.text()).slice(0, MAX_HTML_BYTES)
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let received = 0

  while (received < MAX_HTML_BYTES) {
    const { done, value } = await reader.read()
    if (done || !value) break
    const remaining = MAX_HTML_BYTES - received
    chunks.push(value.byteLength > remaining ? value.slice(0, remaining) : value)
    received += Math.min(value.byteLength, remaining)
  }

  await reader.cancel().catch(() => undefined)
  const buffer = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.byteLength
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(buffer)
}

export async function scanProjectUrl(rawUrl: string): Promise<ProjectScanResult> {
  const url = normalizeScannableProjectUrl(rawUrl)

  let response: Response
  try {
    response = await fetch(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "RelayProjectScanner/1.0 (+https://www.onrelay.app)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })
  } catch {
    throw new BadRequestError("Relay could not fetch that URL.")
  }

  if (!response.ok) {
    throw new BadRequestError("Relay could not fetch that URL.")
  }

  const html = await readCappedHtml(response)
  const metadata = extractProjectMetadataFromHtml(html)
  return { ...metadata, url }
}
