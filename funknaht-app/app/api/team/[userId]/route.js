import { handle, body } from "@/lib/http";
import { setRole, removeMember, listMembers, ROLE_LABEL } from "@/lib/auth";
import { logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";
const nameOf = (org, id) => listMembers(org).find(m => m.id === id)?.name || "Mitglied";

export const PATCH = handle(async (request, { userId }, session) => {
  const { role } = await body(request);
  setRole(session, userId, role);
  logActivity(session, "team", `Rolle von ${nameOf(session.org.id, userId)} auf ${ROLE_LABEL[role]} gesetzt`, userId);
  return { ok: true };
}, "admin");

export const DELETE = handle((request, { userId }, session) => {
  const name = nameOf(session.org.id, userId);
  removeMember(session, userId);
  logActivity(session, "team", `${name} aus dem Team entfernt`, userId);
  return { ok: true };
}, "admin");
