# Relay Design System — CSS Variable Reference

## Palette

All colors use CSS custom properties prefixed `--relay-`. Light mode is the default; dark mode applies via `.dark` class or `prefers-color-scheme: dark`.

| Token | Light | Dark | Usage |
|---|---|---|---|
| `--relay-bg` | `#fafaf9` | `#1a1a1c` | Page background |
| `--relay-surface` | `#ffffff` | `#202022` | Card / panel backgrounds |
| `--relay-surface-raised` | `#ffffff` | `#27272a` | Elevated surfaces |
| `--relay-ink` | `#0f0f0f` | `#e4e4e7` | Primary text |
| `--relay-ink-secondary` | `#3a3a3a` | `#a1a1aa` | Secondary text |
| `--relay-muted` | `#737373` | `#71717a` | Muted text, labels |
| `--relay-faint` | `#a3a3a3` | `#52525b` | Faintest text, icons |
| `--relay-line` | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.07)` | Borders |
| `--relay-line-strong` | `rgba(0,0,0,0.12)` | `rgba(255,255,255,0.13)` | Emphasized borders |
| `--relay-accent` | `#171717` | `#e4e4e7` | Primary buttons |
| `--relay-accent-text` | `#fafafa` | `#09090b` | Text on accent |
| `--relay-soft` | `#f4f4f3` | `#27272a` | Hover / active bg |

## Section Accents

| Token | Value | Usage |
|---|---|---|
| `--relay-section-decision` | `#3b82f6` / `#60a5fa` | Decision indicators |
| `--relay-section-constraint` | `#f59e0b` / `#fbbf24` | Constraint indicators |
| `--relay-section-task` | `#10b981` / `#34d399` | Task indicators |

## Radii

| Token | Value |
|---|---|
| `--relay-radius-xs` | `4px` |
| `--relay-radius-sm` | `6px` |
| `--relay-radius` | `8px` |
| `--relay-radius-lg` | `10px` |

## Timing

| Token | Value |
|---|---|
| `--relay-transition-fast` | `120ms ease` |
| `--relay-transition` | `180ms ease` |
| `--relay-transition-slow` | `280ms ease` |

## Utility Classes

| Class | Effect |
|---|---|
| `.relay-hover-lift` | `translateY(-1px)` on hover, 120ms ease |

## Extension Sidebar

The extension uses its own CSS module (`control-panel.module.css`) with a parallel dark palette matching the dashboard dark theme:

- `--bg: #1a1a1c`, `--surface: #202022`, `--ink: #e4e4e7`
- Section borders: `.contextSectionDecisions` (blue), `.contextSectionConstraints` (amber), `.contextSectionTasks` (emerald)
- Context actions hidden by default, shown on `.contextItem:hover`

## Components

| Component | Path | Purpose |
|---|---|---|
| `FadeIn` | `components/ui/fade-in.tsx` | Opacity + translateY entrance animation |
| `TextReveal` | `components/ui/text-reveal.tsx` | Word-by-word staggered reveal |
| `EmptyState` | `components/ui/empty-state.tsx` | Centered empty state with icon |
| `AppShell` | `components/layout/app-shell.tsx` | Sidebar + main layout |
| `SidebarNav` | `components/layout/sidebar-nav.tsx` | Sidebar navigation links |
| `ProjectSwitcher` | `components/layout/project-switcher.tsx` | Project dropdown |
| `CommandPalette` | `components/layout/command-palette.tsx` | ⌘K command palette |
| `BentoDashboard` | `features/projects/bento-dashboard.tsx` | Main dashboard bento grid |
