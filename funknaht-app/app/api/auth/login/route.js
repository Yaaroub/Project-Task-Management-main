import { cookies } from "next/headers";
import { publicHandler, body, clientIp } from "@/lib/http";
import { login, SESSION_COOKIE, cookieOptions } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const POST = publicHandler(async request => {
  const { token, expires } = await login(await body(request), clientIp(request));
  (await cookies()).set(SESSION_COOKIE, token, cookieOptions(expires));
  return { ok: true };
});
