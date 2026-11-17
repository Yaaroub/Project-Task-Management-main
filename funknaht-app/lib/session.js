import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionFromToken, SESSION_COOKIE } from "./auth";

// For server components: the current session, or a redirect to the login page.
export async function currentSession() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return sessionFromToken(token);
}
export async function requirePageSession() {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}
