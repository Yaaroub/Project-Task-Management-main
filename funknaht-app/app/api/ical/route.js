import { handle } from "@/lib/http";
import { createFeedToken, revokeFeedToken, feedActive } from "@/lib/ical";
import { logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handle((request, params, session) => ({ active: feedActive(session.org.id) }), "admin");

// Creates a new subscription link; the previous one stops working. The link is shown only once.
export const POST = handle((request, params, session) => {
  const token = createFeedToken(session.org.id);
  logActivity(session, "settings", "Kalender-Abo-Link neu erzeugt");
  return { token };
}, "admin");

export const DELETE = handle((request, params, session) => {
  revokeFeedToken(session.org.id);
  logActivity(session, "settings", "Kalender-Abo deaktiviert");
  return { ok: true };
}, "admin");
