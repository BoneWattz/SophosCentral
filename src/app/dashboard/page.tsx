import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DeviceDashboard from "@/components/DeviceDashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <DeviceDashboard email={user.email ?? ""} />;
}
