function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
}

/** Convert common assistant markdown to Telegram-safe HTML. */
export function formatTelegramHtml(text: string): string {
  const lines = text.split("\n")
  return lines
    .map((line) => {
      let escaped = escapeHtml(line)
      escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      escaped = escaped.replace(/`([^`]+)`/g, "<code>$1</code>")
      if (/^[-*]\s+/.test(line)) {
        escaped = `• ${escaped.replace(/^[-*]\s+/, "")}`
      }
      return escaped
    })
    .join("\n")
}

export function formatTelegramPlain(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^[-*]\s+/gm, "• ")
}