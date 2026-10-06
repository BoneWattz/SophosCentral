import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";

// Supabase client for Route Handlers / Server Components. Reads and writes the
// auth session through Next.js cookies so the browser never handles raw tokens.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component: cookies are read-only there.
            // The middleware refreshes the session instead.
          }
        },
      },
    }
  );
}

export function isAllowedEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  const domain = process.env.ALLOWED_EMAIL_DOMAIN?.trim().toLowerCase();
  if (!domain) return true;
  return email.toLowerCase().endsWith(`@${domain}`);
}
