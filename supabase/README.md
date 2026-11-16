# Supabase setup

Apply the migrations **in order** to a Supabase project (SQL editor, or `supabase db push` if you use the CLI):

| File | Phase | Contents |
| --- | --- | --- |
| `0001_foundation.sql` | 1 | Profiles, organizations, roles/permissions, memberships, invitations, audit log, notifications, RLS helpers, `create_organization`, storage buckets |
| `0002_core_management.sql` | 2 | Departments, employees, attendance, leave, projects, tasks |
| `0003_business_operations.sql` | 3 | Customers, suppliers, inventory, sales & purchase orders |
| `0004_finance.sql` | 4 | Invoices, bills, payments, income, expenses |
| `0005_finalization.sql` | 5 | Seed defaults, dashboard stats, platform admin, attendance self-service, realtime |

Then copy `.env.example` to `.env` at the project root and set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Auth settings
- With **Confirm email** enabled, new users must confirm before first sign-in (the app shows a "check your email" screen).
- For password reset links, add your site URL (e.g. `http://localhost:5173`) to **Authentication → URL Configuration**.

## Creating a Platform Admin
Platform admins are never created through the app. After the person has registered, run in the SQL editor:

```sql
update public.profiles set is_platform_admin = true where email = 'person@example.com';
```

## Notes
- Every tenant table has `organization_id` and row level security; permissions come from `role_permissions`.
- Status changes, stock levels, payments, balances and leave decisions are only writable through the workflow functions (security definer RPCs).
- These migrations have not been executed against a live database yet — run them on a development project first.
