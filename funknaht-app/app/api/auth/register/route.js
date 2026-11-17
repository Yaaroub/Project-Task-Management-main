import { cookies } from "next/headers";
import { publicHandler, body } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { register, createSession, SESSION_COOKIE, cookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Creates a new firm with its owner. Can be switched off with ALLOW_SIGNUP=0.
export const POST = publicHandler(async request => {
  if (process.env.ALLOW_SIGNUP === "0") throw new HttpError(403, "Die Registrierung ist derzeit geschlossen.");
  const { user, org } = await register(await body(request));
  const { token, expires } = createSession(user.id, org.id);
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
  return Response.json({ ok: true }, { status: 201 });
});
