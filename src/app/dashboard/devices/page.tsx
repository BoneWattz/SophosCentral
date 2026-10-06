import DevicesView from "@/components/DevicesView";

export default async function DevicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  return <DevicesView initialQuery={q ?? ""} />;
}
