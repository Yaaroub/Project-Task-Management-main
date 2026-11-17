import { buildCalendar, orgForToken } from "@/lib/ical";

export const dynamic = "force-dynamic";

// Public subscription feed for Outlook, Google Calendar and Apple Calendar. Access only with the secret link.
export function GET(request, context) {
  return context.params.then(({ token }) => {
    const firm = orgForToken(token);
    if (!firm) return new Response("Nicht gefunden.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    return new Response(buildCalendar(firm), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'inline; filename="nahtbord.ics"',
        "Cache-Control": "private, max-age=300",
        "X-Robots-Tag": "noindex",
      },
    });
  });
}
