import { CreditCard, Sliders, Puzzle, User } from "lucide-react"

const navItems = [
  { key: "account", label: "Account", icon: User },
  { key: "app", label: "App", icon: Sliders },
  { key: "integrations", label: "Integrations", icon: Puzzle },
  { key: "billing", label: "Billing & Usage", icon: CreditCard },
] as const

export default function SettingsLoading() {
  return (
    <div className="flex flex-col md:flex-row gap-4 md:gap-8">
      {/* Side nav — rendered statically */}
      <nav className="w-full md:w-44 md:shrink-0 md:sticky md:top-0 pt-2 md:pt-6">
        <div className="flex md:flex-col gap-1 overflow-x-auto pb-2 md:pb-0 border-b md:border-b-0 border-[var(--relay-line)]">
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.key}
                className={[
                  "flex shrink-0 whitespace-nowrap items-center gap-2.5 rounded-[var(--relay-radius-sm)] px-3 py-2 text-[13px] font-medium",
                  item.key === "account"
                    ? "bg-[var(--relay-soft)] text-[var(--relay-ink)]"
                    : "text-[var(--relay-muted)]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </div>
            )
          })}
        </div>
      </nav>

      {/* Content area — default to Account section skeleton */}
      <div className="flex-1 max-w-2xl pt-6 space-y-4">
        {/* Profile section */}
        <section className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
          <div className="px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Profile</h2>
          </div>
          <div className="border-t border-[var(--relay-line)]">
            <div className="flex items-center gap-4 px-5 py-4">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-full bg-[var(--relay-soft)]" />
              <div className="space-y-1.5">
                <div className="h-4 w-32 animate-pulse rounded bg-[var(--relay-soft)]" />
                <div className="h-3.5 w-48 animate-pulse rounded bg-[var(--relay-soft)]" />
              </div>
            </div>
          </div>
        </section>

        {/* Account section */}
        <section className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-line)] bg-[var(--relay-surface)]">
          <div className="px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--relay-ink)]">Account</h2>
          </div>
          <div className="border-t border-[var(--relay-line)]">
            <div className="flex items-center justify-between gap-4 px-5 py-4">
              <div>
                <p className="text-[15px] font-medium text-[var(--relay-ink)]">Sign out</p>
                <p className="mt-0.5 text-sm text-[var(--relay-muted)]">End your current session.</p>
              </div>
              <div className="h-9 w-20 animate-pulse rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)]" />
            </div>
          </div>
        </section>

        {/* Danger zone */}
        <section className="overflow-hidden rounded-[var(--relay-radius)] border border-[var(--relay-danger)]/20 bg-[var(--relay-surface)]">
          <div className="px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--relay-danger)]">Danger zone</h2>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-[var(--relay-danger)]/20 px-5 py-4">
            <div>
              <p className="text-[15px] font-medium text-[var(--relay-ink)]">Delete account</p>
              <p className="mt-0.5 text-sm text-[var(--relay-muted)]">
                Permanently delete your account, projects, and all data.
              </p>
            </div>
            <div className="h-9 w-28 animate-pulse rounded-[var(--relay-radius-sm)] bg-[var(--relay-soft)]" />
          </div>
        </section>
      </div>
    </div>
  )
}
