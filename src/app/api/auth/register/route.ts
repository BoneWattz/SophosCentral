import { NextResponse } from "next/server";
import { createClient, isAllowedEmail } from "@/lib/supabase/server";

// POST /api/auth/register  { email, password }
// Adds a new user credential in Supabase Auth. Supabase sends a confirmation
// email, so only people who control the address can activate the account.
export async function POST(request: Request) {
  const { email, password } = await request.json().catch(() => ({}));

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: "This email domain is not allowed" }, { status: 403 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${new URL(request.url).origin}/login` },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(
    {
      message: data.session
        ? "Account created."
        : "Account created. Check your email to confirm it, then sign in.",
    },
    { status: 201 }
  );
}
