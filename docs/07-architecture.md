# 07 — Architecture & Conventions

## Stack
| Layer | Choice | Notes |
| --- | --- | --- |
| Build / dev | Vite (vanilla JS, ES modules) | Fast dev server, route-level code splitting |
| Styling | Tailwind CSS v4 | Theme tokens drive light/dark |
| Backend | Supabase | Postgres, Auth, Storage, Realtime, Row Level Security |

## Frontend Structure (planned)
- **app shell** — layout, router, global state (session, current organization, permissions, theme).
- **pages / modules** — one folder per module (hr, projects, customers, suppliers, inventory, sales, purchases, finance, reports, notifications, settings), each with list, detail and form views.
- **components** — shared UI library (see design system).
- **services** — thin data-access layer per module wrapping Supabase calls; pages never call Supabase directly.
- **utils** — formatting (currency, dates), validation, permission helpers.
- **styles** — Tailwind entry and theme tokens.

## Routing
Client-side router with route guards: unauthenticated → login; no organization → setup; no permission → "no access" page. Routes lazy-load per module.

## State
- Session and organization context loaded once after login and kept globally.
- Module data fetched per page; cached briefly; invalidated after mutations.
- Realtime subscriptions only for notifications and task boards.

## Multi-Tenancy Strategy
- **Shared database, shared schema, tenant column**: every business table has `organization_id`.
- **Row Level Security** on every table: a row is visible only if the user has an active membership in that row's organization and the role has the required permission.
- Helper database functions answer "which organizations is this user in?" and "does this user hold permission X in organization Y?" so policies stay short and consistent.
- Storage buckets use organization-prefixed paths with matching access policies.
- The client never sends a trusted organization id on its own; the server-side policy decides.

## Security
- Only the public (anon) Supabase key in the browser; service-level keys never ship to the client.
- Sensitive multi-step actions (create organization, accept invitation, confirm order with stock changes, record payment) run as database functions/transactions so they are atomic and permission-checked.
- Input validated client-side for UX and server-side (constraints, checks) for safety.
- Audit log for create/update/delete/approve on business data.
- Rate limiting and email confirmation via Supabase Auth settings.

## Data Integrity Rules
- Money stored as exact decimals; quantities as decimals where needed; one currency per organization.
- Document numbers unique per organization, generated from per-organization sequences.
- Status transitions validated (e.g., a closed invoice can't be edited).
- Foreign keys everywhere; soft delete (`deleted_at`) for business records.
- Totals on orders/invoices computed from line items.

## Environments & Configuration
- Environment variables: Supabase URL and anon key (see `.env.example`).
- Separate Supabase projects for development and production.
- Database changes tracked as ordered migration files.

## Performance
Indexes on `organization_id` plus common filters; server-side pagination and search; avoid loading full tables; lazy-load routes and chart libraries.

## Testing Approach
- Role-based walkthroughs per phase.
- Tenant isolation tests (user A cannot read/write org B).
- Permission tests per module action.
- Responsive and theme checks.

## Naming Conventions
- Tables: plural snake_case; columns: snake_case; primary key `id` (UUID); timestamps `created_at`, `updated_at`; actor columns `created_by`, `updated_by`.
- Statuses stored as constrained text/enums, documented in the database doc.
