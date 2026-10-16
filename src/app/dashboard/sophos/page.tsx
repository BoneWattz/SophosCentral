import SophosDirectoryView from "@/components/SophosDirectoryView";

export default async function SophosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  return <SophosDirectoryView initialTab={tab === "groups" ? "groups" : "users"} />;
}
