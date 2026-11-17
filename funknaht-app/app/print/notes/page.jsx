import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { resource } from "@/lib/resources";
import { getProfile } from "@/lib/profile";
import { markdownToDoc } from "@/lib/richtext";
import PrintBar from "@/components/PrintBar";
import RichView from "@/components/RichView";

export const dynamic = "force-dynamic";

// /print/notes?ids=a,b,c – the chosen notes of the own firm, in the order given. At most 100 at once.
async function load(searchParams) {
  const session = await requirePageSession();
  const { ids = "", auto } = await searchParams;
  const wanted = [...new Set(String(ids).split(",").filter(id => /^[0-9a-f]{24}$/.test(id)))].slice(0, 100);
  const notes = resource("notes", session.org.id);
  const found = wanted.map(id => { try { return notes.normalize(notes.store.get(id)); } catch { return null; } }).filter(Boolean);
  return { session, found, auto: auto === "1" };
}

// The page title becomes the default file name when saving as PDF.
export async function generateMetadata({ searchParams }) {
  const { session, found } = await load(searchParams);
  const title = found.length === 1 ? `Notiz – ${found[0].headline}` : `Notizen (${found.length}) – ${session.org.name}`;
  return { title: { absolute: title }, robots: { index: false } };
}

const stamp = d => new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });

export default async function PrintNotes({ searchParams }) {
  const { session, found, auto } = await load(searchParams);
  if (!found.length) notFound();
  const firm = getProfile(session.org).name;
  return (
    <div className="doc-screen">
      <PrintBar title={found.length === 1 ? found[0].headline : `${found.length} Notizen`} auto={auto} />
      {found.map(n => (
        <article key={n._id} className="doc doc--note" aria-label={n.headline}>
          <header className="doc__notehead">
            <span>{firm}</span>
            <span>Stand {stamp(n.updatedAt)}</span>
          </header>
          <h1 className="doc__title">{n.headline}</h1>
          <RichView doc={n.doc || markdownToDoc(n.text)} links />
          <div className="doc__made">Erstellt mit Nahtbord</div>
        </article>
      ))}
    </div>
  );
}
