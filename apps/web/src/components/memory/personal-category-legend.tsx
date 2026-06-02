import {
  PERSONAL_CATEGORY_META,
  personalCategories,
  type PersonalCategory,
} from "@relay/shared"

interface PersonalCategoryLegendProps {
  /** Only show the categories actually present in the current list. Empty/undefined → show all. */
  present?: PersonalCategory[]
}

/**
 * Folk-style legend for personal-memory categories. Renders the colored dot +
 * label for each category, so the personal memory view explains the dots on the
 * cards. Reuses the single PERSONAL_CATEGORY_META source of truth.
 */
export function PersonalCategoryLegend({ present }: PersonalCategoryLegendProps) {
  const shown =
    present && present.length > 0
      ? personalCategories.filter((category) => present.includes(category))
      : personalCategories

  if (shown.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--relay-muted)]">
      {shown.map((category) => {
        const meta = PERSONAL_CATEGORY_META[category]
        return (
          <span key={category} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ backgroundColor: meta.color }}
            />
            {meta.label}
          </span>
        )
      })}
    </div>
  )
}
