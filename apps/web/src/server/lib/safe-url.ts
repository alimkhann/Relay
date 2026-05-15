import { isIP } from "node:net"
import { lookup as dnsLookup } from "node:dns/promises"

import { BadRequestError } from "@/server/http/errors"

export type DnsLookupResult = { address: string; family: number }
export type DnsLookup = (hostname: string) => Promise<DnsLookupResult[]>

const defaultLookup: DnsLookup = (hostname) => dnsLookup(hostname, { all: true })

export function isPrivateIpv4(host: string): boolean {
  const parts = host.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false
  }
  const [a, b] = parts as [number, number, number, number]
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT 100.64.0.0/10
    (a === 169 && b === 254) || // link-local + cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224 // multicast / reserved 224.0.0.0+
  )
}

export function isPrivateIpv6(host: string): boolean {
  let h = host.toLowerCase().replace(/^\[|\]$/g, "")
  const zone = h.indexOf("%")
  if (zone >= 0) h = h.slice(0, zone)
  // IPv4-mapped / embedded: ::ffff:127.0.0.1
  const mappedDotted = /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/.exec(h)
  if (mappedDotted) return isPrivateIpv4(mappedDotted[1]!)
  // IPv4-mapped hex form: ::ffff:7f00:1
  const mappedHex = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(h)
  if (mappedHex) {
    const hi = Number.parseInt(mappedHex[1]!, 16)
    const lo = Number.parseInt(mappedHex[2]!, 16)
    return isPrivateIpv4(`${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`)
  }
  return (
    h === "::" ||
    h === "::1" ||
    h.startsWith("fc") || // unique local fc00::/7
    h.startsWith("fd") ||
    /^fe[89ab]/.test(h) || // link-local fe80::/10
    h.startsWith("ff") // multicast
  )
}

// Resolved IPs only. A value that is not a recognizable IP literal is treated
// as unsafe so a surprising getaddrinfo result can never slip through.
export function isPrivateAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return isPrivateIpv4(address)
  if (version === 6) return isPrivateIpv6(address)
  return true
}

function stripHostBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "")
}

/**
 * Synchronous structural check: parses the URL, blocks literal private IPs and
 * lexical loopback/local names, requires https, and normalizes the URL. This
 * does NOT resolve DNS — it cannot catch a public hostname that resolves to a
 * private IP. assertPublicHttpsUrl adds that layer.
 *
 * Host check runs before the protocol check on purpose so a localhost/private
 * target is reported as a non-public URL rather than a protocol error.
 */
export function normalizePublicHttpsUrl(rawUrl: string): URL {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new BadRequestError("External sources require a valid public URL.")
  }
  if (url.username || url.password) {
    throw new BadRequestError("External sources must not embed credentials.")
  }
  const host = stripHostBrackets(url.hostname).toLowerCase()
  const literal = isIP(host)
  if (literal && isPrivateAddress(host)) {
    throw new BadRequestError("External sources require a public URL.")
  }
  if (
    !literal &&
    (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local"))
  ) {
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
  return url
}

/**
 * Authoritative SSRF guard for outbound fetches of user-supplied URLs.
 * Applies normalizePublicHttpsUrl then resolves the hostname and rejects if
 * ANY resolved address is private/reserved. This closes
 * public-name-to-private-IP attacks (e.g. attacker.com -> 169.254.169.254,
 * *.nip.io, decimal/hex IP literals normalized by getaddrinfo).
 *
 * Residual gap: the fetch implementation re-resolves DNS at connect time, so a
 * sub-second DNS-rebind race remains theoretically possible. Closing it fully
 * requires pinning the connection to the validated IP (undici dispatcher with
 * a custom lookup). Tracked as post-launch hardening; this matches the risk
 * posture of the existing project-scan-service.ts fetch path.
 */
export async function assertPublicHttpsUrl(
  rawUrl: string,
  options: { lookup?: DnsLookup } = {},
): Promise<URL> {
  const url = normalizePublicHttpsUrl(rawUrl)
  const host = stripHostBrackets(url.hostname)
  if (isIP(host)) return url // literal already validated structurally

  const lookup = options.lookup ?? defaultLookup
  let resolved: DnsLookupResult[]
  try {
    resolved = await lookup(host)
  } catch {
    throw new BadRequestError("External source host could not be resolved.")
  }
  if (resolved.length === 0 || resolved.some((entry) => isPrivateAddress(entry.address))) {
    throw new BadRequestError("External sources require a public URL.")
  }
  return url
}

/**
 * Reads a response body into a Buffer, aborting once maxBytes is exceeded so a
 * server with no content-length cannot stream an unbounded body into memory.
 */
export async function readCappedBody(response: Response, maxBytes: number): Promise<Buffer> {
  if (!response.body) {
    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) {
      throw new BadRequestError("External source exceeds the current fetch size limit.")
    }
    return buffer
  }
  const reader = response.body.getReader()
  const chunks: Buffer[] = []
  let received = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done || !value) break
    received += value.byteLength
    if (received > maxBytes) {
      await reader.cancel().catch(() => undefined)
      throw new BadRequestError("External source exceeds the current fetch size limit.")
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks)
}
