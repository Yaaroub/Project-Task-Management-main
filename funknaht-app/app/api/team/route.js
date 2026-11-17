import { handle, body } from "@/lib/http";
import { listMembers, addMember, ROLE_LABEL } from "@/lib/auth";
import { logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";

// Everyone in the firm may see the team (needed for assigning tasks).
export const GET = handle((request, params, session) => listMembers(session.org.id));

export const POST = handle(async (request, params, session) => {
  const member = await addMember(session, await body(request));
  logActivity(session, "team", `${member.name} als ${ROLE_LABEL[member.role]} ins Team aufgenommen`, member.id);
  return Response.json(member, { status: 201 });
}, "admin");
