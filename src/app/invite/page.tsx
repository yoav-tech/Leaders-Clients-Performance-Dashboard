import InviteForm from "@/components/InviteForm";

export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <InviteForm token={token ?? ""} />;
}
