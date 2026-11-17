import { handle, body } from "@/lib/http";
import { vapidKeys, subscribe, unsubscribe, deviceCount } from "@/lib/push";

export const dynamic = "force-dynamic";

// Public key for the browser and how many of the person's devices receive pushes.
export const GET = handle((request, params, session) => ({ publicKey: vapidKeys().publicKey, devices: deviceCount(session) }));
// Register this device. Everyone may do this for themselves, including "Nur lesen".
export const POST = handle(async (request, params, session) => subscribe(session, await body(request), request.headers.get("user-agent")), "viewer");
// Remove this device ({ endpoint }) or, without endpoint, all own devices.
export const DELETE = handle(async (request, params, session) => {
  const data = await request.json().catch(() => ({}));
  return unsubscribe(session, typeof data?.endpoint === "string" ? data.endpoint : "");
}, "viewer");
