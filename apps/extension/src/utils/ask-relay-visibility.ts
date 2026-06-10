export const HIDE_ASK_RELAY_STORAGE_KEY = "relay:hideAskRelayExtension"
export const HIDE_ASK_RELAY_CHANGED_EVENT = "relay:hideAskRelayExtension-changed"

export function isAskRelayHidden(): boolean {
  if (typeof localStorage === "undefined") return false
  return localStorage.getItem(HIDE_ASK_RELAY_STORAGE_KEY) === "true"
}

export function syncHideAskRelayExtension(hide: boolean): void {
  localStorage.setItem(HIDE_ASK_RELAY_STORAGE_KEY, String(hide))
  window.dispatchEvent(
    new CustomEvent(HIDE_ASK_RELAY_CHANGED_EVENT, { detail: { hidden: hide } })
  )
}

export function subscribeHideAskRelayExtension(
  onChange: (hidden: boolean) => void
): () => void {
  const onCustom = (e: Event) => {
    const hidden = (e as CustomEvent<{ hidden?: boolean }>).detail?.hidden
    onChange(hidden ?? isAskRelayHidden())
  }
  const onStorage = (e: StorageEvent) => {
    if (e.key === HIDE_ASK_RELAY_STORAGE_KEY) {
      onChange(e.newValue === "true")
    }
  }
  window.addEventListener(HIDE_ASK_RELAY_CHANGED_EVENT, onCustom)
  window.addEventListener("storage", onStorage)
  return () => {
    window.removeEventListener(HIDE_ASK_RELAY_CHANGED_EVENT, onCustom)
    window.removeEventListener("storage", onStorage)
  }
}