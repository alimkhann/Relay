import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect,
}));

vi.mock("@/server/policies/viewer", () => ({
  requirePageViewer: vi.fn(async () => ({
    userId: "user-1",
    mode: "session",
  })),
}));

import ProjectPage from "./page";

describe("ProjectPage", () => {
  it("redirects legacy project detail visits back to the dashboard", async () => {
    await ProjectPage({
      params: Promise.resolve({ projectId: "project_123" }),
    });

    expect(redirect).toHaveBeenCalledWith("/dashboard?project=project_123");
  });
});
