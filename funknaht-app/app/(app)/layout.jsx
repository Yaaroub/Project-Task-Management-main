import { getProfile } from "@/lib/profile";
import { getWorkspace } from "@/lib/workspace";
import Shell from "@/components/Shell";
import { requirePageSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// Every page in this group needs a valid session; otherwise the user lands on /login.
export default async function AppLayout({ children }) {
  const session = await requirePageSession();
  const { logo, logoWidth, logoStyle } = getProfile(session.org);
  return <Shell modules={getWorkspace(session.org.id).modules} logo={logo} logoWidth={logoWidth} logoStyle={logoStyle} session={session}>{children}</Shell>;
}
