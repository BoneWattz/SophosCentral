# Sophos Device Dashboard

Next.js (React) app: Supabase email/password login + a dashboard of devices enrolled in Sophos Central.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/login` | Sign in, sets httpOnly session cookies |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/devices` | Enrolled Sophos endpoints (login required) |

## Setup

1. Create a Supabase project; copy URL + anon key (Project Settings â†’ API).
2. In Sophos Central create **tenant-level** API credentials (Global Settings â†’ API Credentials Management, role: Service Principal Read-only).
3. `copy .env.example .env.local` and fill it in.
4. `npm install` then `npm run dev` â†’ http://localhost:3000

Sophos credentials stay server-side; the browser only talks to `/api/*`.

## Deploy to Netlify

Import the GitHub repo in Netlify (it auto-detects Next.js), then add these in Site configuration -> Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ALLOWED_EMAIL_DOMAIN`, `SOPHOS_CLIENT_ID`, `SOPHOS_CLIENT_SECRET` (mark the Sophos secret as secret). In Supabase -> Authentication -> URL Configuration, add your Netlify URL as the Site URL.

## User accounts

Sign-up is admin-only; there is no public registration page.

1. Add `SUPABASE_SERVICE_ROLE_KEY` (Supabase -> Project Settings -> API -> service_role) plus `ADMIN_EMAIL` and `ADMIN_PASSWORD` to `.env.local`.
2. Run `npm run seed-admin` once. It creates the default admin (or promotes/resets it if it exists).
3. Sign in, click **Manage users**, and add or delete accounts. New accounts are auto-confirmed.

Admin endpoints: `GET/POST/DELETE /api/users` (admin only). Admin status lives in `app_metadata.role`, which users cannot edit.
On Netlify only `SUPABASE_SERVICE_ROLE_KEY` is needed (mark it secret); `ADMIN_*` are for the seed script only.
In Supabase, also switch off "Allow new users to sign up" so nobody can bypass the admin panel.
