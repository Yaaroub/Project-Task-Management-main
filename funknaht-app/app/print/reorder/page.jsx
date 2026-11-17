import { requirePageSession } from "@/lib/session";
import { resource } from "@/lib/resources";
import { getProfile } from "@/lib/profile";
import { day, money, parseIds, pickDocs } from "@/lib/print";
import PrintBar from "@/components/PrintBar";

export const dynamic = "force-dynamic";
export const metadata = { title: { absolute: "Bestellliste" }, robots: { index: false } };

// /print/reorder?ids=a,b – order list for the chosen articles; without ids all articles at or below their minimum stock.
// The suggested quantity fills the stock up to twice the minimum.
export default async function Reorder({ searchParams }) {
  const session = await requirePageSession();
  const { ids, auto } = await searchParams;
  const r = resource("products", session.org.id);
  const wanted = parseIds(ids, 500);
  const list = (wanted.length ? pickDocs(r, wanted) : r.store.list().map(r.normalize).filter(p => p.stock <= p.minStock))
    .sort((a, b) => (a.category || "").localeCompare(b.category || "") || a.title.localeCompare(b.title));
  const suggest = p => Math.max(0, Math.ceil(p.minStock * 2 - p.stock));
  const total = list.reduce((s, p) => s + suggest(p) * (p.price || 0), 0);
  return (
    <div className="doc-screen">
      <PrintBar title={`Bestellliste · ${list.length} Artikel`} auto={auto === "1"} />
      <article className="doc doc--note doc--sheet" aria-label="Bestellliste">
        <header className="doc__notehead"><span>{getProfile(session.org).name}</span><span>Stand {day(new Date().toISOString())}</span></header>
        <h1 className="doc__title">Bestellliste</h1>
        <p>{wanted.length ? "Ausgewählte Artikel." : "Alle Artikel am oder unter dem Mindestbestand."} Vorschlag: auffüllen auf das Doppelte des Mindestbestands.</p>
        <table className="doc__table">
          <thead><tr><th>Artikel</th><th>Art.-Nr.</th><th>Kategorie</th><th className="r">Bestand</th><th className="r">Mindest</th><th className="r">Vorschlag</th><th className="r">Einkauf</th><th>Bestellt</th></tr></thead>
          <tbody>
            {list.map(p => (
              <tr key={p._id}>
                <td>{p.title}</td><td>{p.sku || ""}</td><td>{p.category}</td>
                <td className="r">{p.stock}</td><td className="r">{p.minStock}</td><td className="r"><b>{suggest(p)}</b></td>
                <td className="r">{p.price ? money(p.price) : ""}</td><td className="doc__blank" />
              </tr>
            ))}
            {!list.length && <tr><td colSpan={8} style={{ textAlign: "center", color: "#667" }}>Nichts nachzubestellen</td></tr>}
          </tbody>
        </table>
        {total > 0 && <table className="doc__sum"><tbody><tr className="doc__gross"><td>Geschätzter Einkauf (netto)</td><td className="r">{money(total)}</td></tr></tbody></table>}
        <div className="doc__made">Erstellt mit Nahtbord</div>
      </article>
    </div>
  );
}
