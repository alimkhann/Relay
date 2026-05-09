import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

const relayClientFetch = vi.fn()

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/lib/telemetry/client", () => ({
  createClientFlowId: () => "flow_uninstall_feedback",
}))

vi.mock("@/lib/telemetry/fetch", () => ({
  relayClientFetch: (...args: unknown[]) => relayClientFetch(...args),
}))

import GoodbyePage from "./page"

describe("GoodbyePage", () => {
  beforeEach(() => {
    relayClientFetch.mockReset()
    relayClientFetch.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  })

  it("submits extension uninstall feedback before showing the thank-you state", async () => {
    render(<GoodbyePage />)

    fireEvent.click(screen.getByRole("button", { name: "Too complex to set up" }))
    fireEvent.change(screen.getByPlaceholderText("Anything else you'd like to share? (optional)"), {
      target: { value: "Setup did not make sense." },
    })
    fireEvent.click(screen.getByRole("button", { name: "Send feedback" }))

    await waitFor(() => {
      expect(relayClientFetch).toHaveBeenCalledWith(
        "/api/feedback/uninstall",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            reasons: ["too_complex"],
            note: "Setup did not make sense.",
          }),
          telemetry: expect.objectContaining({
            area: "feedback",
            event: "extension.uninstall_feedback",
            flowId: "flow_uninstall_feedback",
            logSuccess: true,
          }),
        })
      )
    })
    expect(await screen.findByText("Thank you for the feedback")).toBeTruthy()
  })
})
