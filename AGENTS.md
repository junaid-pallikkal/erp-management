# AGENTS.md

Follow these rules in every task, without exception.

## Details
- [Visual rules](docs/DESIGN.md)
- [Workflow and wording rules](docs/UX.md)
- [Build discipline](docs/SCOPE.md)
- [4-hour plan and progress](docs/TASKS.md)

## Who we build for
- The end user is not a developer. Every screen, label and message must make sense to a non-technical person.
- Use simple, everyday words everywhere: UI text, error messages and your own explanations to me.
- Avoid technical terms. Say "Couldn't save. Please try again" instead of "500 server error".

## Tech stack
- Vite + React (JavaScript), Tailwind CSS, Supabase.
- Icons: `lucide-react` only.
- Don't add any other framework, UI library or package without asking first.

## Project structure
- `src/pages/`: one file per page.
- `src/components/`: reusable pieces (Button, Modal, IconButton, Tooltip, EmptyState, Toast, ConfirmDialog).
- `src/lib/supabase.js`: the single Supabase client.
- `src/services/`: all database calls, one file per feature (e.g. `clients.js`). Pages and components never call Supabase directly.
- `src/hooks/`: shared hooks.
- Keep each file small and focused on one thing.

## Supabase
- Keys live in `.env` as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Never commit `.env`. Provide `.env.example`.
- Never use the service role key in the frontend.
- Row Level Security on for every table, with a simple policy. SQL for tables and policies lives in `supabase/schema.sql`.
- Supabase Auth, email and password, unless told otherwise.
- Every service call handles errors. Show a plain-language message. Never show raw error text.

## Data and state
- React state and context only. No Redux or other state library.
- Load data in one place per page, with a loading state and an empty state.
- After create, edit or delete, refresh the list automatically.

## Routing
- `react-router-dom`. Short route list, in one file.
- Protect pages that need login.

## Quality checks
- `npm run dev` and `npm run build` both work before a task is done.
- No console errors or warnings.
- Test the main flow once at mobile width before finishing a task.

## Communication
- Keep replies short and in simple language. Say what you did and what I need to check.
- If something is unclear, ask one short question instead of guessing.
- No long explanations or summaries unless I ask.
