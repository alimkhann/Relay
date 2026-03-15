import type { RelayConfig } from "./config.js"

export class RelayClient {
  private readonly baseUrl: string
  private readonly token: string

  constructor(config: RelayConfig) {
    this.baseUrl = config.apiBase.replace(/\/+$/, "")
    this.token = config.token
  }

  async get<T>(path: string): Promise<T> {
    return this.request("GET", path)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request("POST", path, body)
  }

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request("PATCH", path, body)
  }

  async delete(path: string): Promise<void> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${this.token}` }
    })
    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Relay API error: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`)
    }
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      "Authorization": `Bearer ${this.token}`,
      "Accept": "application/json"
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json"
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      let message = `Relay API error: ${response.status} ${response.statusText}`
      if (text) {
        try {
          const parsed = JSON.parse(text) as { error?: string; message?: string }
          message += ` — ${parsed.error ?? parsed.message ?? text}`
        } catch {
          message += ` — ${text}`
        }
      }
      throw new Error(message)
    }

    return response.json() as Promise<T>
  }
}
