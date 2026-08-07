import InviteForm from "@/components/InviteForm";
import { verifyInviteToken } from "@/lib/invite";
import { getUserByUsername } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const username = await verifyInviteToken(token ?? "", Math.floor(Date.now() / 1000));
  // Only offer onboarding if the token is valid AND the invited (still-pending) user exists.
  const user = username ? await getUserByUsername(username) : null;
  const valid = !!user && user.passwordHash == null;
  return <InviteForm token={token ?? ""} username={valid ? user!.username : ""} valid={valid} />;
}
