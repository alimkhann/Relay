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

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => <img {...props} />,
}));

vi.mock("@/components/layout/sidebar-context", () => ({
  SidebarProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useSidebar: () => ({ collapsed: false, setCollapsed: () => {}, toggle: () => {} }),
}));

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: ({ user }: { user: { name: string; email?: string } | null }) => (
    <div data-testid="sidebar" data-name={user?.name ?? ""} data-email={user?.email ?? ""} />
  ),
}));

vi.mock("@/components/layout/sidebar-main-area", () => ({
  SidebarMainArea: ({ children }: { children: ReactNode }) => <div>{children}</div>,
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
    expect(screen.getByTestId("sidebar").getAttribute("data-name")).toBe("Relay User");
    expect(screen.getByTestId("sidebar").getAttribute("data-email")).toBe("user@example.com");
  });
});
