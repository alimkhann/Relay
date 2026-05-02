import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const push = vi.fn();
const refresh = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push,
    refresh,
  }),
}));

import { SidebarProjectSwitcher } from "./sidebar-project-switcher";

describe("SidebarProjectSwitcher", () => {
  it("updates the visible project name immediately while a switch is pending", () => {
    render(
      <SidebarProjectSwitcher
        projects={[
          { id: "project-1", name: "Relay" },
          { id: "project-2", name: "Orbit" },
        ]}
        currentId="project-1"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /relay/i }));
    fireEvent.click(screen.getByRole("button", { name: /orbit/i }));

    expect(screen.getByRole("button", { name: /orbit · switching/i })).toBeTruthy();
    expect(push).toHaveBeenCalledWith("/dashboard?project=project-2");
    expect(refresh).toHaveBeenCalled();
  });
});
