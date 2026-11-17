import { notFound } from "next/navigation";
import { requirePageSession } from "@/lib/session";
import { resource } from "@/lib/resources";
import { listMembers } from "@/lib/auth";
import { getProfile } from "@/lib/profile";
import { day, hours, isAdmin } from "@/lib/print";
import PrintBar from "@/components/PrintBar";

export const dynamic = "force-dynamic";
const KIND = { arbeit: "Arbeit", urlaub: "Urlaub", krank: "Krank", feiertag: "Feiertag" };

// /print/timesheet?month=2026-11&user=<id> – working time of one person for one month.
// Members only get their own sheet; admins may choose anyone in the firm.
async function load(searchParams) {
  const session = await requirePageSession();
  const { month: m, user, auto } = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(m || "") ? m : new Date().toISOString().slice(0, 7);
  const person = listMembers(session.org.id).find(p => p.id === (user || session.user.id));
  if (!person || (person.id !== session.user.id && !isAdmin(session))) return { session, person: null };
  const r = resource("times", session.org.id);
  const rows = r.store.list().map(r.normalize).filter(t => t.userId === person.id && t.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.start || "").localeCompare(b.start || ""));
  return { session, person, month, rows, auto: auto === "1" };
}

const monthName = m => new Date(m + "-01T12:00:00").toLocaleDateString("de-DE", { month: "long", year: "numeric" });

export async function generateMetadata({ searchParams }) {
  const { person, month } = await load(searchParams);
  return { title: { absolute: person ? `Stundenzettel ${person.name} ${month}` : "Stundenzettel" }, robots: { index: false } };
}

export default async function Timesheet({ searchParams }) {
  const { session, person, month, rows, auto } = await load(searchParams);
  if (!person) notFound();
  const firm = getProfile(session.org).name;
  const worked = rows.reduce((s, t) => s + t.minutes, 0);
  const days = new Set(rows.filter(t => t.kind === "arbeit").map(t => t.date)).size;
  const count = kind => rows.filter(t => t.kind === kind).length;
  return (
    <div className="doc-screen">
      <PrintBar title={`Stundenzettel ${person.name} · ${monthName(month)}`} auto={auto} />
      <article className="doc doc--note doc--sheet" aria-label="Stundenzettel">
        <header className="doc__notehead"><span>{firm}</span><span>Erstellt am {day(new Date().toISOString())}</span></header>
        <h1 className="doc__title">Stundenzettel {monthName(month)}</h1>
        <p><b>{person.name}</b> · {person.email}</p>
        <table className="doc__table">
          <thead><tr><th>Datum</th><th>Art</th><th>Beginn</th><th>Ende</th><th className="r">Pause</th><th className="r">Arbeitszeit</th><th>Notiz</th></tr></thead>
          <tbody>
            {rows.map(t => (
              <tr key={t._id}>
                <td>{new Date(t.date + "T12:00:00").toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" })}</td>
                <td>{KIND[t.kind]}</td>
                <td>{t.kind === "arbeit" ? t.start : ""}</td><td>{t.kind === "arbeit" ? t.end || "läuft" : ""}</td>
                <td className="r">{t.breakMinutes ? `${t.breakMinutes} Min.` : ""}</td>
                <td className="r">{t.kind === "arbeit" && !t.running ? hours(t.minutes) : ""}</td>
                <td>{t.note}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} style={{ textAlign: "center", color: "#667" }}>Keine Einträge in diesem Monat</td></tr>}
          </tbody>
        </table>
        <table className="doc__sum">
          <tbody>
            <tr><td>Arbeitstage</td><td className="r">{days}</td></tr>
            <tr><td>Urlaubstage</td><td className="r">{count("urlaub")}</td></tr>
            <tr><td>Krankheitstage</td><td className="r">{count("krank")}</td></tr>
            <tr><td>Feiertage</td><td className="r">{count("feiertag")}</td></tr>
            <tr className="doc__gross"><td>Arbeitszeit gesamt</td><td className="r">{hours(worked)} Std.</td></tr>
          </tbody>
        </table>
        <div className="doc__signs">
          <div><span />Datum, Unterschrift Mitarbeiter/in</div>
          <div><span />Datum, Unterschrift Arbeitgeber</div>
        </div>
        <div className="doc__made">Erstellt mit Nahtbord</div>
      </article>
    </div>
  );
}
