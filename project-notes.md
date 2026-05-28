# CoachBoard — Project Notes & Handoff

> Context document for Claude Code. Read this first to understand the project, decisions made, current state, and what's next.

## What we're building

A **coaching dashboard** for a running + strength coach to manage athletes. Two roles:

- **Coach** — sees all clients, their synced fitness metrics, assigns weekly training plans, reads client feedback.
- **Client (athlete)** — sees their own dashboard: assigned weekly plan, their synced metrics (runs, sleep, HR zones, recovery), and can leave a comment/feedback on each training session.

Live fitness data is pulled from **Strava, Apple Health, and Whoop** via their APIs so the coach gets live feedback and history (training, sleep, heart-rate zones) to adapt programming.

Starting with 1–3 clients (MVP) but built to scale.

## Design language (important — keep this consistent)

Strava-inspired, clean and editorial. The client explicitly asked for "Strava's interface, font, colors (white and orange), very simple UI yet all information as needed" and "higher quality designs that don't look floppy or AI made."

- **Primary accent:** Strava orange `#FC4C02` — used surgically for CTAs, accents, "done" indicators only. Not everywhere.
- **Background:** white, lots of whitespace, content breathes.
- **Typography:** bold tracked-out uppercase micro-labels (the Strava "DISTANCE / MOVING TIME" treatment), large metric numbers with small unit suffixes, sentence-case headlines.
- **Borders:** sharp 1px hairline borders. No heavy shadows, no over-rounded boxes, no "AI slop" gradients.
- **System font stack** is fine (closest free match to Strava's Maison Neue).

Secondary colors used in the prototype:
- Run/green: `#0F6E56`, light bg `#E1F5EE`
- Strength/purple: `#3C3489`, light bg `#EEEDFE`
- Rest/gray: `#5F5E5A`, bg `#F1EFE8`
- HR zone ramp: `#FFCAB0` → `#FF9F73` → `#FC6D2A` → `#E54304` → `#A82F02`

## Tech stack

- **Next.js 15** — App Router, `src/` directory, TypeScript, Tailwind CSS, Turbopack.
- **Supabase** — auth + Postgres database. Using `@supabase/ssr` for cookie-based auth in App Router.
- **Vercel** — frontend hosting (intended).
- **Hetzner** (existing CX23 Ubuntu server) — intended for background sync workers (cron jobs hitting Strava/Whoop/Apple Health APIs) later.
- Icons: `lucide-react`.

Installed packages beyond defaults: `@supabase/supabase-js`, `@supabase/ssr`, `lucide-react`.

## Environment variables (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...   # server-only, for sync workers
```

## Database schema (already created in Supabase)

The full schema is live in Supabase (ran successfully). Tables, all with Row Level Security enabled:

- **profiles** — extends `auth.users`. Fields: id (FK to auth.users), email, full_name, role (`coach`|`client` enum), avatar_url, timezone (default 'Europe/Madrid'), timestamps. A trigger `handle_new_user()` auto-creates a profile row on signup, reading `full_name` and `role` from auth metadata.
- **coach_client** — many-to-many link. coach_id, client_id, status (`active`|`paused`|`archived`), started_at. Unique(coach_id, client_id).
- **training_plans** — client_id, coach_id, name, goal, start_date, end_date.
- **sessions** — planned training. plan_id, client_id, scheduled_date, type (`run`|`strength`|`rest`|`mobility`|`cross_training`), title, description, targets (jsonb: distance_km/pace/hr_zone/duration_min/sets), status (`planned`|`done`|`skipped`|`modified`), linked_activity_id (FK to activities — links a planned session to the actual synced activity for plan-vs-actual).
- **session_comments** — session_id, author_id, body, created_at. Both coach and client can read/write on accessible sessions.
- **activities** — synced workouts. client_id, provider (`strava`|`whoop`|`apple_health`|`manual` enum), external_id, start_time, type, name, distance_km, duration_sec, avg_hr, max_hr, avg_pace_sec_per_km, elevation_gain_m, hr_zones (jsonb), raw_data (jsonb). Unique(provider, external_id).
- **sleep_logs** — client_id, provider, date, total/deep/rem/light/awake minutes, hrv_ms, resting_hr, sleep_score, raw_data. Unique(client_id, provider, date).
- **provider_connections** — OAuth tokens. user_id, provider, external_user_id, access_token, refresh_token, expires_at, scope, last_sync_at. Unique(user_id, provider).

**RLS summary:** clients see only their own data; coaches can read (and for plans/sessions, write) data for clients they have an active `coach_client` link with. Provider connections are private to the owning user.

## Current code state

Files that exist and are confirmed working (0 TS errors):

- `src/lib/supabase/client.ts` — `createClient()` browser client via `createBrowserClient`.
- `src/lib/supabase/server.ts` — async `createClient()` server client with cookie handling.
- `src/lib/supabase/middleware.ts` — `updateSession(request)`: refreshes session, redirects unauthenticated users to `/login` (allows `/`, `/login`, `/signup`, `/auth`).
- `src/middleware.ts` — Next.js middleware entry, calls `updateSession`, with matcher excluding static assets.
- `tsconfig.json` — has `"baseUrl": "."` and `"paths": { "@/*": ["src/*"] }` (or `./src/*`). The `@/` alias maps to `src/`.

Files just created (via Copilot) but **`/login` currently returns 404**:

- `src/app/login/page.tsx` — login/signup UI (Strava style, orange CTA). Uses `formAction` to call server actions.
- `src/app/login/actions.ts` — `'use server'` actions `login(formData)` and `signup(formData)`. Both use Supabase auth; signup passes `full_name` and `role` into options.data; both redirect to `/portal` on success.

## ⚠️ ACTIVE BUG — fix this first

**`http://localhost:3000/login` returns a 404 "This page could not be found."** but `http://localhost:3000/` (homepage) loads fine, and the dev server runs without TS errors.

Likely causes to check:
1. `page.tsx` may not be at exactly `src/app/login/page.tsx` (Copilot may have placed it at the wrong path, e.g. `src/login/`, project root, or named `Page.tsx`/`login.tsx`).
2. The dev server may need a restart to pick up the new route.

Diagnose by running `find src -name "page.tsx"` and `ls src/app/login`, confirm the file is at `src/app/login/page.tsx` (lowercase), fix placement if needed, restart dev server.

## Auth notes

- Email confirmation should be **disabled** in Supabase Auth settings during development (Authentication → Sign In / Providers → Email → "Confirm email" OFF) so signup works instantly. Re-enable before production.
- On signup the DB trigger creates the profile row automatically from auth metadata (`full_name`, `role`).

## The prototype UI (reference for /portal)

A full client-portal prototype was designed (not yet in the codebase as the real page). Key sections, top to bottom:

1. **Top nav** — orange zap logo "COACHBOARD", tabs (Training/Activity/Progress/Profile), user avatar.
2. **Editorial hero** — "Good morning, [name]." with a tiny "WEEK 14 OF 20" eyebrow, today's date on the right.
3. **Coach note** — orange-left-border callout with the coach's weekly message.
4. **4-up metric bar** with hairline dividers — Weekly distance, Recovery (Whoop), Sleep avg, Resting HR. Big numbers, small units, trend sublabels.
5. **This week** (2/3 width) — list of sessions. Each row: date stamp (left) with status dot (filled orange = done, pulsing orange ring = today, gray ring = upcoming), then type micro-label + title + description + target chips. Done/today sessions have a comment area; completed comments show with orange left border, empty ones show an input + orange "Log" button.
6. **Sidebar** (1/3 width) — HR zones (5 horizontal bars, orange ramp), Sleep (big total, stacked stage bar, deep/REM/light/awake breakdown + HRV/resting HR/score), Weekly goals (distance/sessions/zone-2 progress bars).
7. **Recent activity feed** — 3-up grid of Strava activities (distance, pace, avg HR, elevation), synced timestamp.

Sample athlete used in mockups: "Marc Aubert". Coach: "Sassine".

## Build order (agreed plan)

1. Supabase schema ✅ done
2. Next.js scaffold + auth — in progress (fix `/login` 404, verify signup → profile row)
3. Strava OAuth (first integration, end-to-end: auth → token refresh → fetch activities → store)
4. Wire `/portal` dashboard to real Supabase data (replace mock data)
5. Add Whoop + Apple Health (repeat Strava pattern)
6. Background sync on Hetzner (cron pulling fresh data every few hours)

## Immediate next steps

1. Fix the `/login` 404 (file placement).
2. Test signup end-to-end: sign up as a coach → confirm a row appears in `auth.users` and `profiles` (role=coach).
3. Build `/portal` page: server component that reads the logged-in user's profile + sessions + latest activity/sleep from Supabase, rendered in the Strava-style layout above. Add a logout action.
4. Seed a sample client + training plan + sessions so the portal has data to show.

## Working-style notes

- The builder (Sassine) is working independently and prefers step-by-step, plain-language guidance with exact commands. Not a deep-background developer — explain VS Code/terminal actions explicitly.
- GitHub Copilot Agent mode is active in the editor and has auto-rewritten files before (once replaced our middleware with its own version). Be aware files may have been modified outside our plan; always read the actual file contents rather than assuming.
