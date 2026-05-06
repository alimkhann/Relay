export class RelayApiClient {
  constructor(
    private readonly apiBase: string,
    private readonly token: string
  ) {}

  async get<T>(path: string): Promise<T> {
    return this.request("GET", path)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request("POST", path, body)
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(`${this.apiBase.replace(/\/+$/, "")}${path}`, {
      method,
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${this.token}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })

    if (response.status === 429) {
      const data = await response.json().catch(() => ({})) as {
        error?: string
        plan?: string
        upgradeUrl?: string
        retryAfterSeconds?: number
      }
      const retryAfter = response.headers.get("Retry-After")
      let message = data.error ?? "Rate limit exceeded."
      if (data.plan !== "pro" && data.upgradeUrl) {
        message += `\n  Upgrade Relay for higher limits: ${data.upgradeUrl}`
      } else if (retryAfter) {
        message += `\n  Try again in ${retryAfter} seconds.`
      }
      throw new Error(message)
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(`Relay API error: ${response.status} ${response.statusText}${text ? ` — ${text}` : ""}`)
    }

    return response.json() as Promise<T>
  }
}
