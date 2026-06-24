type AuthHandlerWithAccounts = {
  GET: (
    request: Request,
    context: { params: Promise<{ path: string[] }> },
  ) => Promise<Response>
}

function getAccountsFromPayload(payload: unknown) {
  if (Array.isArray(payload)) {
    return payload
  }

  if (!payload || typeof payload !== "object") {
    return []
  }

  const record = payload as Record<string, unknown>
  if (Array.isArray(record.accounts)) {
    return record.accounts
  }
  if (Array.isArray(record.data)) {
    return record.data
  }
  return []
}

export function hasGoogleAccount(payload: unknown) {
  return getAccountsFromPayload(payload).some((account) => {
    if (!account || typeof account !== "object") {
      return false
    }

    const record = account as Record<string, unknown>
    return record.providerId === "google" || record.provider === "google"
  })
}

export async function currentSessionUsesGoogle(
  authHandler: AuthHandlerWithAccounts,
  request: Request,
  url: URL,
) {
  try {
    const accountsRequest = new Request(new URL("/api/auth/list-accounts", url.origin), {
      method: "GET",
      headers: {
        Origin: url.origin,
        Cookie: request.headers.get("cookie") ?? "",
      },
    })

    const accountsResponse = await authHandler.GET(accountsRequest, {
      params: Promise.resolve({ path: ["list-accounts"] }),
    })

    if (!accountsResponse.ok) {
      return false
    }

    return hasGoogleAccount(await accountsResponse.json())
  } catch {
    return false
  }
}
