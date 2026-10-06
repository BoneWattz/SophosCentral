import { NextResponse } from "next/server";
import { createClient, isAllowedEmail } from "@/lib/supabase/server";

// POST /api/auth/login  { email, password }
// Verifies credentials with Supabase and sets the session as httpOnly cookies.
export async function POST(request: Request) {
  const { email, password } = await request.json().catch(() => ({}));

  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } });
}
