import { overview } from "@/lib/overview";
import { requirePageSession } from "@/lib/session";
import { getWorkspace, setupSteps } from "@/lib/workspace";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";

// Data is read on the server, so the dashboard renders in one pass without loading spinners.
export default async function Home() {
  const session = await requirePageSession();
  return <Dashboard data={overview(session.org.id)} userName={session.user.name} setup={setupSteps(session)} industry={getWorkspace(session.org.id).industry} />;
}
