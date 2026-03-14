export type RelayThemeMode = "light" | "dark" | "system";
export type RelayResolvedTheme = "light" | "dark";

const storage = typeof chrome !== "undefined" ? chrome.storage.local : null;
const THEME_KEY = "relay.themeMode";

export function resolveRelayThemeMode(mode: RelayThemeMode): RelayResolvedTheme {
  if (mode === "system") {
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }

    return "dark";
  }

  return mode;
}

export async function getRelayThemeMode(): Promise<RelayThemeMode> {
  if (!storage) return "system";

  const values = await storage.get(THEME_KEY);
  const value = values[THEME_KEY];
  return value === "light" || value === "dark" || value === "system"
    ? value
    : "system";
}

export async function setRelayThemeMode(mode: RelayThemeMode) {
  if (!storage) return;
  await storage.set({
    [THEME_KEY]: mode,
  });
}
