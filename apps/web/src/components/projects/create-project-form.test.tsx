import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();
const relayClientFetch = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

vi.mock("@/lib/telemetry/client", () => ({
  createClientFlowId: () => "flow_project_create",
  logClientEvent: vi.fn(),
}));

vi.mock("@/lib/telemetry/fetch", () => ({
  relayClientFetch: (...args: unknown[]) => relayClientFetch(...args),
}));

import { CreateProjectForm } from "./create-project-form";

describe("CreateProjectForm", () => {
  beforeEach(() => {
    push.mockClear();
    refresh.mockClear();
    relayClientFetch.mockReset();
  });

  it("shows the description guidance, live counter, and limits the textarea to 200 characters", () => {
    render(<CreateProjectForm />);

    expect(
      screen.getByText(
        "Recommended for project association and other features. You can change or add it later.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("0/200")).toBeTruthy();

    fireEvent.change(
      screen.getByPlaceholderText(
        "A short description of the project so Relay can route related chats correctly.",
      ),
      {
        target: { value: "abc" },
      },
    );

    expect(screen.getByText("3/200")).toBeTruthy();
    expect(
      screen
        .getByPlaceholderText(
          "A short description of the project so Relay can route related chats correctly.",
        )
        .getAttribute("maxLength"),
    ).toBe("200");
  });

  it("redirects new projects to the dashboard project view", async () => {
    relayClientFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        project: {
          id: "project_123",
          slug: "relay",
        },
      }),
    });

    render(<CreateProjectForm />);

    fireEvent.change(
      screen.getByPlaceholderText("https://example.com"),
      {
        target: { value: "https://www.onrelay.app" },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText("E.g., Acapella or Internal Tools"),
      {
        target: { value: "Relay" },
      },
    );
    fireEvent.change(
      screen.getByPlaceholderText(
        "A short description of the project so Relay can route related chats correctly.",
      ),
      {
        target: { value: "Keep AI project continuity alive." },
      },
    );
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith("/dashboard?project=project_123");
    });
    expect(relayClientFetch).toHaveBeenCalledWith(
      "/api/projects",
      expect.objectContaining({
        body: JSON.stringify({
          name: "Relay",
          slug: "relay",
          description: "Keep AI project continuity alive.",
          projectUrl: "https://www.onrelay.app",
        }),
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("scans a URL and only fills blank fields", async () => {
    relayClientFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Scanned Name",
        description: "Scanned description.",
        url: "https://example.com/",
      }),
    });

    render(<CreateProjectForm />);

    fireEvent.change(screen.getByPlaceholderText("https://example.com"), {
      target: { value: "https://example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    await waitFor(() => {
      expect(screen.getByDisplayValue("Scanned Name")).toBeTruthy();
    });
    expect(screen.getByDisplayValue("Scanned description.")).toBeTruthy();

    relayClientFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        name: "Replacement",
        description: "Replacement description.",
        url: "https://example.com/",
      }),
    });
    fireEvent.click(screen.getByRole("button", { name: "Scan" }));

    await waitFor(() => {
      expect(relayClientFetch).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByDisplayValue("Scanned Name")).toBeTruthy();
    expect(screen.getByDisplayValue("Scanned description.")).toBeTruthy();
  });
});
