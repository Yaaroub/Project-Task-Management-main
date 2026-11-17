import { handle } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { sendTo } from "@/lib/push";

export const dynamic = "force-dynamic";

// Sends a test message to all of the person's own devices.
export const POST = handle(async (request, params, session) => {
  const sent = await sendTo(session.org.id, [session.user.id], { title: "Nahtbord", body: "So sehen Erinnerungen auf diesem Gerät aus.", tag: "test", url: "/calendar" });
  if (!sent) throw new HttpError(409, "Kein Gerät hat die Nachricht angenommen. Bitte Push auf diesem Gerät neu einschalten.");
  return { sent };
}, "viewer");
