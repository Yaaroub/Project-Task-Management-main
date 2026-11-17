import { cookies } from "next/headers";
import { statSync } from "node:fs";
import { handle, body } from "@/lib/http";
import { deleteOrg, listMembers, SESSION_COOKIE } from "@/lib/auth";
import { tenantFile } from "@/lib/db";

export const dynamic = "force-dynamic";

// Information about the own firm, including the size of its separate database file.
export const GET = handle((request, params, session) => {
  let bytes = 0;
  for (const suffix of ["", "-wal"]) { try { bytes += statSync(tenantFile(session.org.id) + suffix).size; } catch {} }
  return { id: session.org.id, name: session.org.name, members: listMembers(session.org.id).length, databaseBytes: bytes };
});

// Deletes the firm and its database permanently (owner only, name must be typed as confirmation).
export const DELETE = handle(async (request, params, session) => {
  const { confirm } = await body(request);
  deleteOrg(session, confirm);
  (await cookies()).delete(SESSION_COOKIE);
  return { ok: true };
}, "owner");
