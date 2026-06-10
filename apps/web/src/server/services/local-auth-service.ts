import { randomUUID } from "node:crypto"

import { createServiceRepositoryBundle } from "@relay/db"

import { initializeUserSettings } from "./settings-service"

function fallbackDisplayName(email: string) {
  return email.split("@")[0] || "Relay Local User"
}

function parseLocalAuthInput(input: unknown) {
  if (!input || typeof input !== "object") {
    throw new Error("Email is required.")
  }

  const payload = input as { email?: unknown; name?: unknown }
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : ""
  const name = typeof payload.name === "string" ? payload.name.trim() : ""

  if (!email) {
    throw new Error("Email is required.")
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailPattern.test(email)) {
    throw new Error("Enter a valid email address.")
  }

  return {
    email,
    name: name ? name.slice(0, 120) : null,
  }
}

export interface LocalAuthUser {
  id: string
  email: string
  name: string | null
  image: null
  isNewUser: boolean
}

export async function resolveOrCreateLocalAuthUser(input: unknown): Promise<LocalAuthUser> {
  const parsed = parseLocalAuthInput(input)
  const repositories = createServiceRepositoryBundle()
  const existing = await repositories.profiles.getByEmail(parsed.email)
  const displayName = parsed.name || existing?.displayName || fallbackDisplayName(parsed.email)

  if (existing) {
    await repositories.profiles.upsert({
      id: existing.id,
      email: parsed.email,
      displayName,
      avatarUrl: existing.avatarUrl,
    })

    await initializeUserSettings(existing.id)

    return {
      id: existing.id,
      email: parsed.email,
      name: displayName,
      image: null,
      isNewUser: false,
    }
  }

  const created = await repositories.profiles.upsert({
    id: randomUUID(),
    email: parsed.email,
    displayName,
    avatarUrl: null,
  })

  await initializeUserSettings(created.id, { newUser: true })

  return {
    id: created.id,
    email: parsed.email,
    name: created.displayName,
    image: null,
    isNewUser: true,
  }
}
