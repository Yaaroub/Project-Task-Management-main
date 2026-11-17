import { cookies } from "next/headers";
import { publicHandler } from "@/lib/http";
import { destroySession, sessionToken, SESSION_COOKIE } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const POST = publicHandler(async request => {
  destroySession(sessionToken(request));
  (await cookies()).delete(SESSION_COOKIE);
  return { ok: true };
});
