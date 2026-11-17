import { handle, body } from "@/lib/http";
import { resource } from "@/lib/resources";
import { HttpError, logActivity } from "@/lib/db";
import { listMembers } from "@/lib/auth";

export const dynamic = "force-dynamic";
const isAdmin = session => session.role === "owner" || session.role === "admin";

export const GET = handle((request, { resource: name }, session) => {
  const r = resource(name, session.org.id);
  const q = (new URL(request.url).searchParams.get("q") || "").trim().toLowerCase();
  let items = r.store.list().map(r.normalize);
  // Personal entries (working time): everyone sees their own, admins see all.
  if (r.owned && (r.private || !isAdmin(session))) items = items.filter(item => item.userId === session.user.id);
  if (q) items = items.filter(item => JSON.stringify(item).toLowerCase().includes(q));
  return items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
});

export const POST = handle(async (request, { resource: name }, session) => {
  const r = resource(name, session.org.id);
  const data = await body(request);
  const fields = r.fields(data);
  if (r.owned) {
    // Admins may record entries for a colleague; everyone else only for themselves.
    let person = session.user;
    if (data.userId && data.userId !== session.user.id) {
      if (!isAdmin(session) || r.private) throw new HttpError(403, "Einträge für andere Personen dürfen nur Admins anlegen.");
      person = listMembers(session.org.id).find(m => m.id === data.userId);
      if (!person) throw new HttpError(400, "Diese Person gehört nicht zur Firma.");
    }
    fields.userId = person.id;
    fields.userName = person.name;
  }
  const doc = r.normalize(r.store.create({ ...fields, createdBy: session.user.id }));
  logActivity(session, name, `${r.label} „${r.title(doc)}“ angelegt`, doc._id);
  return Response.json(doc, { status: 201 });
});
