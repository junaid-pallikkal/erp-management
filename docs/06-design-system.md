# 06 — Design System

## Direction
Minimal, premium SaaS. Generous whitespace, calm neutral palette with one accent color, subtle borders over heavy shadows, clear typography hierarchy, simple workflows.

## Foundations
- **Color tokens** (defined once as theme variables; no hard-coded colors in components):
  - Surface: background, surface, surface-raised, border.
  - Text: primary, secondary, muted, inverse.
  - Accent: primary, hover, subtle background.
  - Status: success, warning, danger, info (each with text + subtle background).
- **Typography** — one sans-serif family; scale for page title, section title, body, small, caption; tabular numerals for money/quantities.
- **Spacing** — 4px base scale; consistent page padding and card gutters.
- **Radius & elevation** — small radius for inputs/buttons, medium for cards, soft shadows only for overlays (drawers, modals, menus).
- **Icons** — one consistent line-icon set.

## Themes
- Light and dark themes via the same tokens.
- Default follows system preference; user choice saved to profile and local storage.
- Both themes must meet contrast guidelines (WCAG AA for text).

## Reusable Components
| Group | Components |
| --- | --- |
| Layout | App shell, sidebar, topbar, page header, breadcrumbs, tabs, card, grid |
| Inputs | Text, number, currency, textarea, select, multi-select, date/range picker, checkbox, radio, switch, file upload, search |
| Actions | Button (primary/secondary/ghost/danger, sizes, loading), icon button, dropdown menu |
| Data display | Data table (sort, filter, pagination, bulk select), stat card, badge/status pill, avatar, timeline, empty state, skeleton |
| Feedback | Toast, inline alert, confirmation dialog, progress bar, spinner |
| Overlays | Drawer, modal, popover, tooltip, command/global search |
| Charts | Line, bar, donut with shared colors and tooltips |
| Forms | Field wrapper (label, hint, error), form sections, line-item editor (orders/invoices) |

## Page Patterns
- **List page**: header + primary action → toolbar (search, filters) → table → pagination.
- **Detail page**: header with status + actions → tabs → related-record tables → activity timeline.
- **Form drawer**: title, sections, sticky footer with Cancel/Save.
- **Dashboard**: KPI row → charts → activity/task lists.

## Responsiveness
| Breakpoint | Behavior |
| --- | --- |
| Desktop (≥1024px) | Persistent sidebar, multi-column dashboards, full tables |
| Tablet (640–1023px) | Collapsible icon sidebar, 2-column grids |
| Mobile (<640px) | Slide-over menu, single column, tables become stacked cards or horizontally scrollable, drawers go full screen |

## Accessibility
Keyboard navigable, visible focus rings, labelled controls, ARIA roles for dialogs/menus/tables, status never conveyed by color alone, respects reduced-motion.

## Content & Tone
Short, plain labels; verbs on buttons ("Create invoice"); friendly empty states with a next action; clear, specific error messages.
