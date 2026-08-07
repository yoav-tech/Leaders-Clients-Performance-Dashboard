import InviteForm from "@/components/InviteForm";
import { verifyInviteToken } from "@/lib/invite";
import { getUserById } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const userId = await verifyInviteToken(token ?? "", Math.floor(Date.now() / 1000));
  // Only offer onboarding if the token is valid AND the invited (still-pending) user exists.
  const user = userId ? await getUserById(userId) : null;
  const valid = !!user && user.passwordHash == null;
  return <InviteForm token={token ?? ""} username={valid ? user!.username : ""} valid={valid} />;
}
