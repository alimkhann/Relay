import { describe, expect, it } from "vitest"

import { formatTelegramHtml, formatTelegramPlain } from "./telegram-format"

describe("telegram-format", () => {
  it("converts bold markdown to html", () => {
    expect(formatTelegramHtml("use **list_projects** tool")).toBe(
      "use <b>list_projects</b> tool",
    )
  })

  it("strips markdown for plain fallback", () => {
    expect(formatTelegramPlain("- **Docs** and `code`")).toBe("• Docs and code")
  })
})