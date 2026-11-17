import { cookies } from "next/headers";
import { handle, body } from "@/lib/http";
import { changePassword, createSession, SESSION_COOKIE, cookieOptions } from "@/lib/auth";
import { logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";

// Changes the password, signs out all devices and starts a fresh session here.
export const POST = handle(async (request, params, session) => {
  const { current, next } = await body(request);
  await changePassword(session, current, next);
  const { token, expires } = createSession(session.user.id, session.org.id);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
  logActivity(session, "account", "Passwort geändert");
  return { ok: true };
}, "viewer");
