import { handle, body } from "@/lib/http";
import { ask, aiStatus, suggestions } from "@/lib/assistant";
import { getWorkspace } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// Whether an AI model answers (or only the built-in manual) and questions that fit the current page.
export const GET = handle((request, params, session) => {
  const status = aiStatus();
  const page = new URL(request.url).searchParams.get("page") || "";
  return { ai: status.configured && getWorkspace(session.org.id).ai, local: status.local, suggestions: suggestions(session.org.id, page) };
});

// Asking changes nothing, so it is open to every role including "Nur lesen".
export const POST = handle(async (request, params, session) => ask(session, await body(request)), "viewer");
