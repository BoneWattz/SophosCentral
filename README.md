# Sophos Device Dashboard

Next.js (React) app: Supabase email/password login + a dashboard of devices enrolled in Sophos Central.

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Add a user credential (`{email, password}`) in Supabase |
| POST | `/api/auth/login` | Sign in, sets httpOnly session cookies |
| POST | `/api/auth/logout` | Sign out |
| GET | `/api/devices` | Enrolled Sophos endpoints (login required) |

## Setup

1. Create a Supabase project; copy URL + anon key (Project Settings → API).
2. In Sophos Central create **tenant-level** API credentials (Global Settings → API Credentials Management, role: Service Principal Read-only).
3. `copy .env.example .env.local` and fill it in.
4. `npm install` then `npm run dev` → http://localhost:3000

Sophos credentials stay server-side; the browser only talks to `/api/*`.

## Deploy to Netlify

Import the GitHub repo in Netlify (it auto-detects Next.js), then add these in Site configuration -> Environment variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `ALLOWED_EMAIL_DOMAIN`, `SOPHOS_CLIENT_ID`, `SOPHOS_CLIENT_SECRET` (mark the Sophos secret as secret). In Supabase -> Authentication -> URL Configuration, add your Netlify URL as the Site URL.

