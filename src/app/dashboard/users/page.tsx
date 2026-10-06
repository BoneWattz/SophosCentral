import { redirect } from "next/navigation";
import UsersView from "@/components/UsersView";
import { createClient } from "@/lib/supabase/server";

export default async function UsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The API enforces admin access too; this just keeps non-admins off the page.
  if (!user || user.app_metadata?.role !== "admin") redirect("/dashboard");

  return <UsersView currentEmail={user.email ?? ""} />;
}
