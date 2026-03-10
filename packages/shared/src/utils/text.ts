export function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim()
}

export function slugify(value: string): string {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
