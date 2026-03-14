import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getAuthServerMock } = vi.hoisted(() => ({
  getAuthServerMock: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getAuthServer: getAuthServerMock,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children: ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui/theme-toggle", () => ({
  ThemeToggle: () => <div data-testid="theme-toggle" />,
}));

vi.mock("@/components/layout/sidebar-nav", () => ({
  SidebarNav: () => <nav data-testid="sidebar-nav" />,
}));

vi.mock("@/components/layout/sidebar-project-switcher", () => ({
  SidebarProjectSwitcher: () => <div data-testid="project-switcher" />,
}));

vi.mock("@/components/layout/account-menu", () => ({
  AccountMenu: ({ name, email }: { name: string; email?: string }) => (
    <div data-testid="account-menu" data-name={name} data-email={email ?? ""} />
  ),
}));

vi.mock("@/components/layout/workspace-cache", () => ({
  WorkspaceViewport: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("uses the provided account without doing another auth lookup", async () => {
    getAuthServerMock.mockReset();

    render(
      await AppShell({
        account: {
          name: "Relay User",
          email: "user@example.com",
        },
        children: <div>Dashboard body</div>,
      }),
    );

    expect(getAuthServerMock).not.toHaveBeenCalled();
    expect(screen.getByText("Dashboard body")).toBeTruthy();
    expect(screen.getByTestId("account-menu").getAttribute("data-name")).toBe("Relay User");
    expect(screen.getByTestId("account-menu").getAttribute("data-email")).toBe("user@example.com");
  });
});
