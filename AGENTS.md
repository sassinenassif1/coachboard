# CoachBoard — Agent Instructions

> Read this ENTIRE file before writing any code. It is the single source of truth for project architecture, conventions, and constraints.

## What this is

A **coaching dashboard** for running + strength coaches. Two roles:

- **Coach** — sees all linked clients, their synced fitness metrics, assigns weekly training plans, leaves coaching notes on sessions.
- **Client (athlete)** — sees their own dashboard: assigned weekly plan, synced metrics (runs, sleep, HR zones, recovery), can comment/feedback on each session.

Live fitness data will be pulled from **Strava, Apple Health, and Whoop** APIs. Starting MVP with 1–3 clients.

## Tech stack

| Layer | Tech | Notes |
|-------|------|-------|
| Framework | **Next.js 16.2.6** | App Router, `src/` directory, TypeScript, Turbopack |
| Styling | **Tailwind CSS v4** | PostCSS plugin, `@import "tailwindcss"` syntax |
| Auth + DB | **Supabase** | `@supabase/ssr` cookie-based auth, Postgres with RLS |
| Hosting | **Vercel** | Auto-deploys from `main` branch |
| Icons | `lucide-react` | |
| React | **v19.2.4** | |

## ⚠️ Next.js 16 breaking changes

<!-- BEGIN:nextjs-agent-rules -->
This is NOT the Next.js you know. This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

Key differences from Next.js 14/15:

- **`proxy.ts` replaces `middleware.ts`** — The file is `src/proxy.ts`, the export is `export async function proxy(request)`, NOT `middleware`.
- **`params` is a Promise** — In dynamic routes: `params: Promise<{ slug: string }>`, must `await params`.
- **Server Actions** use `'use server'` directive at top of file, called via `formAction` on buttons.
- **`cookies()` from `next/headers` is async** — must `await cookies()`.

## Directory structure

```
src/
├── app/
│   ├── globals.css          # Tailwind imports + Geist font theme
│   ├── layout.tsx           # Root layout (Geist fonts, metadata)
│   ├── page.tsx             # Landing page (redirects authed users to /portal)
│   ├── login/
│   │   ├── page.tsx         # Login/signup form
│   │   └── actions.ts       # Server actions: login(), signup()
│   ├── api/
│   │   ├── oauth/[provider]/
│   │   │   ├── start/route.ts    # OAuth redirect to Strava/Whoop
│   │   │   └── callback/route.ts # OAuth callback, token exchange, initial sync
│   │   └── cron/sync/route.ts    # Background sync cron (every 4h)
│   └── portal/
│       ├── page.tsx         # Client dashboard (sessions, sleep, activities, goals)
│       ├── actions.ts       # Server actions: logout(), addComment(), syncProvider()
│       ├── history/
│       │   └── [metric]/page.tsx  # History tables (activities, sleep, recovery, etc.)
│       └── coach/
│           ├── page.tsx     # Coach dashboard (multi-athlete overview)
│           ├── actions.ts   # Server actions: createPlan, addSession, deleteSession, etc.
│           └── [clientId]/
│               ├── page.tsx # Coach drill-down into single athlete
│               └── plan/
│                   └── page.tsx # Plan builder (weekly calendar, session CRUD)
├── lib/
│   ├── oauth/
│   │   ├── providers.ts     # Strava/Whoop config, token exchange, refresh
│   │   └── sync.ts          # Fetch + store activities/sleep, auto-link to sessions
│   └── supabase/
│       ├── client.ts        # Browser-side Supabase client
│       ├── server.ts        # Server-side Supabase client (async, uses cookies)
│       └── middleware.ts    # updateSession() — refreshes auth, redirects unauthed
├── proxy.ts                 # Next.js 16 proxy (was middleware.ts)
└── types/
    └── supabase-middleware.d.ts
```

## Path aliases

`@/` maps to `src/*` (configured in tsconfig.json). Always use `@/` imports:
```ts
import { createClient } from '@/lib/supabase/server'
```

## Design language — CRITICAL, keep consistent

Strava-inspired. Clean and editorial. NOT generic Material/Bootstrap.

- **Primary accent:** `#FC4C02` (Strava orange) — used surgically for CTAs, accents, "done" indicators. Not everywhere.
- **Background:** white (`bg-white`), lots of whitespace.
- **Typography:** bold tracked-out uppercase micro-labels (`text-[10px] font-bold tracking-wider uppercase text-gray-400`), large metric numbers with small unit suffixes, sentence-case headlines.
- **Borders:** sharp 1px hairline borders (`border-gray-100`). No heavy shadows, no over-rounded boxes, no gradients.
- **Font:** system font stack (Geist Sans).

### Color tokens

| Use | Color | Light BG |
|-----|-------|----------|
| Primary/CTA | `#FC4C02` | — |
| Run session | `#0F6E56` | `#E1F5EE` |
| Strength session | `#3C3489` | `#EEEDFE` |
| Rest/mobility | `#5F5E5A` | `#F1EFE8` |
| Cross training | `#3C3489` | `#EEEDFE` |

HR zone ramp (zone 1→5): `#FFCAB0` → `#FF9F73` → `#FC6D2A` → `#E54304` → `#A82F02`

### Session types

```ts
type SessionType = 'run' | 'strength' | 'rest' | 'mobility' | 'cross_training'
```

### UI patterns

- **Nav:** 14px height, logo left (orange square + white zap icon + "COACHBOARD"), role badge + logout right.
- **Hero:** "Good morning, [name]." with date on the right.
- **Metric cards:** big number + small unit suffix + trend sublabel.
- **Session rows:** status dot (filled orange=done, ring=today/future) → date → type badge → title → description → target chips → comments.
- **Comment input:** on every session, `text-sm` input + orange "Send" button.

## Database schema (Supabase Postgres, all tables have RLS)

### Enums
- `user_role`: `'coach'` | `'client'`
- `session_status`: `'planned'` | `'done'` | `'skipped'` | `'modified'`
- `session_type`: `'run'` | `'strength'` | `'rest'` | `'mobility'` | `'cross_training'`
- `provider_type`: `'strava'` | `'whoop'` | `'apple_health'` | `'manual'`
- `link_status`: `'active'` | `'paused'` | `'archived'`

### Tables

**profiles** — extends auth.users
- `id` uuid PK (FK → auth.users), `email`, `full_name`, `role` (user_role), `avatar_url`, `timezone` (default 'Europe/Madrid'), `created_at`, `updated_at`
- Auto-created by `handle_new_user()` trigger on auth.users insert

**coach_client** — many-to-many coach↔client link
- `id` uuid PK, `coach_id` (FK → profiles), `client_id` (FK → profiles), `status` (link_status), `started_at`
- Unique(coach_id, client_id)

**training_plans**
- `id` uuid PK, `client_id`, `coach_id`, `name`, `goal`, `start_date`, `end_date`, `created_at`

**sessions** — planned training sessions
- `id` uuid PK, `plan_id` (FK → training_plans), `client_id`, `scheduled_date`, `type` (session_type), `title`, `description`, `targets` (jsonb: distance_km/pace/hr_zone/duration_min/sets), `status` (session_status), `linked_activity_id` (FK → activities), `created_at`

**session_comments**
- `id` uuid PK, `session_id` (FK → sessions), `author_id` (FK → profiles), `body` text, `created_at`

**activities** — synced workouts
- `id` uuid PK, `client_id`, `provider` (provider_type), `external_id`, `start_time`, `type`, `name`, `distance_km`, `duration_sec`, `avg_hr`, `max_hr`, `avg_pace_sec_per_km`, `elevation_gain_m`, `hr_zones` (jsonb), `raw_data` (jsonb), `synced_at`
- Unique(provider, external_id)

**sleep_logs**
- `id` uuid PK, `client_id`, `provider`, `date`, `total_minutes`, `deep_minutes`, `rem_minutes`, `light_minutes`, `awake_minutes`, `hrv_ms`, `resting_hr`, `sleep_score`, `raw_data` (jsonb), `synced_at`
- Unique(client_id, provider, date)

**provider_connections** — OAuth tokens
- `id` uuid PK, `user_id`, `provider`, `external_user_id`, `access_token`, `refresh_token`, `expires_at`, `scope`, `last_sync_at`
- Unique(user_id, provider)

### RLS summary
- Clients see only their own data
- Coaches can read (and write plans/sessions) for clients with active `coach_client` link
- Provider connections are private to owning user

## Auth flow

1. User signs up with email/password + full_name + role via `/login` form
2. Server action calls `supabase.auth.signUp()` with metadata
3. DB trigger `handle_new_user()` creates `profiles` row from metadata
4. Cookie-based session managed by `@supabase/ssr` via `proxy.ts`
5. `updateSession()` in proxy refreshes tokens and redirects unauthed users to `/login`

## Routing logic

- `/` — landing page, redirects authed users to `/portal`
- `/login` — login/signup form
- `/portal` — client dashboard (if role=client), redirects coaches to `/portal/coach`
- `/portal/coach` — coach multi-athlete overview
- `/portal/coach/[clientId]` — coach drill-down into specific athlete

## Server actions

`src/app/login/actions.ts`:
- `login(formData)` — email/password sign in → redirect `/portal`
- `signup(formData)` — create account with role metadata → redirect `/portal`

`src/app/portal/actions.ts`:
- `logout()` — sign out → redirect `/login`
- `addComment(formData)` — insert into `session_comments`
- `syncProvider(formData)` — refresh token if needed, sync provider data, revalidate

`src/app/portal/coach/actions.ts`:
- `createPlan(formData)` — create training plan → redirect to plan builder
- `updatePlan(formData)` — update plan name, goal, dates
- `addSession(formData)` — add session to plan with type, title, targets
- `updateSession(formData)` — edit session details
- `deleteSession(formData)` — remove session and its comments

## Test accounts (development)

- Coach: `coach@test.com` / `test1234` (id: `29a0fe00-4645-494b-b6fe-9fea4cbfb95a`)
- Client: `marc@test.com` / `test1234` (id: `b68de05d-a364-4243-9c79-caaf03ad6b56`)

## What's shipped ✅

1. ~~Supabase schema~~ ✅
2. ~~Auth + dashboards~~ ✅ — login, signup, logout, role-based routing
3. ~~Strava OAuth~~ ✅ — OAuth flow, token refresh, fetch activities
4. ~~Whoop OAuth~~ ✅ — workouts, sleep, recovery sync
5. ~~Client portal~~ ✅ — sessions, sleep sidebar, activities, weekly goals, data connections
6. ~~Coach dashboard~~ ✅ — multi-athlete overview with metrics
7. ~~Coach client drill-down~~ ✅ — with coaching notes
8. ~~Plan builder~~ ✅ — `/portal/coach/[clientId]/plan` with weekly calendar, session CRUD, targets
9. ~~Activity↔Session linking~~ ✅ — auto-matches synced activities to planned sessions by date+type
10. ~~Background sync~~ ✅ — `/api/cron/sync` runs every 4h via Vercel cron
11. ~~History pages~~ ✅ — activities, distance, sleep, recovery, resting HR, sessions
12. ~~Deployed~~ ✅ — Vercel + GitHub auto-deploy

## What's next

- **Apple Health integration** — repeat Strava/Whoop pattern
- **Strava webhook** — real-time push instead of polling
- **Notification system** — coach notified when athlete completes session
- **Custom domain** — configure production domain
- **Mobile responsive** — optimize layouts for phone/tablet

## Conventions

- All pages are **server components** (no `'use client'` unless needed for interactivity)
- Mutations go through **server actions** in `actions.ts` files
- Supabase client: use `createClient()` from `@/lib/supabase/server` in server components/actions
- Style with **Tailwind utility classes** inline, no CSS modules
- Use `lucide-react` for all icons
- Type safety: define interfaces for DB rows, avoid `any`
- Keep components in the same file as the page unless they're reused across pages

## Commands

```bash
npm run dev     # Start dev server (Turbopack, port 3000)
npm run build   # Production build
npm run lint    # ESLint
```
