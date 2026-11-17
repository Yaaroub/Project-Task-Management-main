import "server-only";
import { HttpError } from "./db";
import { requireSession } from "./auth";

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

// Changing requests must come from this site (CSRF protection on top of SameSite cookies).
function checkOrigin(request) {
  if (SAFE.has(request.method)) return;
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (!origin || new URL(origin).host !== host) throw new HttpError(403, "Anfrage von fremder Herkunft abgelehnt.");
}

const json = (data, init = {}) => Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...(init.headers || {}) } });

function failure(error) {
  const known = error instanceof HttpError;
  if (!known) console.error(error);
  return json({ error: known ? error.message : "Anfrage konnte nicht verarbeitet werden." }, { status: known ? error.status : 500 });
}

// Public route (login, register): origin check only.
export function publicHandler(fn) {
  return async (request, context) => {
    try {
      checkOrigin(request);
      const result = await fn(request, context?.params ? await context.params : {});
      return result instanceof Response ? result : json(result ?? { ok: true });
    } catch (error) { return failure(error); }
  };
}

// Signed-in route. Reading needs any role; changes need at least "member" unless minRole says otherwise.
export function handle(fn, minRole) {
  return async (request, context) => {
    try {
      checkOrigin(request);
      const session = requireSession(request, minRole || (SAFE.has(request.method) ? "viewer" : "member"));
      const params = context?.params ? await context.params : {};
      const result = await fn(request, params, session);
      return result instanceof Response ? result : json(result ?? { ok: true });
    } catch (error) { return failure(error); }
  };
}

export async function body(request) {
  const data = await request.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpError(400, "Ungültige Anfrage.");
  return data;
}

export const clientIp = request => (request.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
