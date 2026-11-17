import { handle, body } from "@/lib/http";
import { resource } from "@/lib/resources";
import { HttpError, logActivity } from "@/lib/db";

export const dynamic = "force-dynamic";

const STATUS_TEXT = { todo: "offen", doing: "in Arbeit", review: "in Prüfung", done: "erledigt" };
const ORDER_STATUS_TEXT = { anfrage: "Anfrage", angebot: "Angebot verschickt", beauftragt: "beauftragt", in_arbeit: "in Arbeit",
  erledigt: "erledigt", abgerechnet: "abgerechnet", abgelehnt: "abgelehnt" };

// Personal entries (working time) belong to one person; only that person and admins may touch them.
function assertOwn(r, doc, session) {
  if (r.owned && doc.userId !== session.user.id && (r.private || !["owner", "admin"].includes(session.role))) throw new HttpError(403, "Dieser Eintrag gehört einer anderen Person.");
}

export const GET = handle((request, { resource: name, id }, session) => {
  const r = resource(name, session.org.id);
  const doc = r.normalize(r.store.get(id));
  assertOwn(r, doc, session);
  return doc;
});

export const PATCH = handle(async (request, { resource: name, id }, session) => {
  const r = resource(name, session.org.id);
  const patch = await body(request);
  let before;
  const doc = r.normalize(r.store.change(id, previous => {
    before = r.normalize(previous);
    assertOwn(r, before, session);
    return { ...r.fields(patch, before), updatedBy: session.user.id };
  }));
  // Audit log: one readable line per meaningful change.
  if (name === "tasks" && patch.status && before.status !== doc.status)
    logActivity(session, name, `„${doc.headline}“ ist jetzt ${STATUS_TEXT[doc.status]}`, id);
  else if (name === "orders" && patch.status && before.status !== doc.status)
    logActivity(session, name, `Auftrag ${doc.number} ist jetzt ${ORDER_STATUS_TEXT[doc.status]}`, id);
  else if (name === "projects" && "archived" in patch && before.archived !== doc.archived)
    logActivity(session, name, `Projekt „${doc.name}“ ${doc.archived ? "archiviert" : "reaktiviert"}`, id);
  else if (!("timer" in patch))
    logActivity(session, name, `${r.label} „${r.title(doc)}“ bearbeitet`, id, { coalesce: true });
  return doc;
});

export const DELETE = handle((request, { resource: name, id }, session) => {
  const r = resource(name, session.org.id);
  assertOwn(r, r.store.get(id), session);
  const doc = r.store.remove(id);
  logActivity(session, name, `${r.label} „${r.title(doc)}“ gelöscht`, id);
  return { ok: true };
});
