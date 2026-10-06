import { NextResponse } from "next/server";
import { createAdminClient, getAdminUser } from "@/lib/supabase/admin";
import { isAllowedEmail } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// All handlers here are admin-only.
const forbidden = () => NextResponse.json({ error: "Admin access required" }, { status: 403 });

// GET /api/users -> list accounts
export async function GET() {
  if (!(await getAdminUser())) return forbidden();

  const { data, error } = await createAdminClient().auth.admin.listUsers({ perPage: 200 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const users = data.users.map((u) => ({
    id: u.id,
    email: u.email,
    role: u.app_metadata?.role === "admin" ? "admin" : "user",
    createdAt: u.created_at,
    lastSignInAt: u.last_sign_in_at ?? null,
  }));
  return NextResponse.json({ users });
}

// POST /api/users { email, password, role? } -> create an account (already confirmed)
export async function POST(request: Request) {
  if (!(await getAdminUser())) return forbidden();

  const { email, password, role } = await request.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string") {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }
  if (!isAllowedEmail(email)) {
    return NextResponse.json({ error: "This email domain is not allowed" }, { status: 400 });
  }

  const { data, error } = await createAdminClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: role === "admin" ? "admin" : "user" },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ user: { id: data.user.id, email: data.user.email } }, { status: 201 });
}

// DELETE /api/users?id=<uuid> -> remove an account (not your own)
export async function DELETE(request: Request) {
  const admin = await getAdminUser();
  if (!admin) return forbidden();

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  if (id === admin.id) {
    return NextResponse.json({ error: "You can't delete your own account" }, { status: 400 });
  }

  const { error } = await createAdminClient().auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
