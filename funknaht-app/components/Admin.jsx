"use client";
import FirmLogo from "@/components/FirmLogo";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiBell, FiDownload, FiCommand, FiUsers, FiUserPlus, FiTrash2, FiKey, FiDatabase, FiList, FiCalendar, FiCopy, FiLink, FiHardDrive, FiFileText, FiLayers, FiHelpCircle } from "react-icons/fi";
import { api } from "@/lib/client";
import { Field, PageHead, Modal, useToast, confirmDelete, rise } from "./ui";
import { useSession } from "./Shell";
import { INDUSTRIES, MODULES, normalizeModules } from "@/lib/workspace-shared";

// [export name, label, area that must be switched on]
const EXPORTS = [["customers", "Kunden", "customers"], ["orders", "Aufträge", "orders"], ["invoices", "Rechnungen", "invoices"], ["tasks", "Aufgaben", "tasks"], ["projects", "Projekte", "projects"],
  ["products", "Inventar", "inventory"], ["notes", "Notizen", "notes"], ["events", "Termine", "calendar"], ["times", "Zeiten", "times"], ["expenses", "Ausgaben", "expenses"]];
const SHORTCUTS = [["Strg / ⌘ + K", "Suche und Befehle"], ["Alt + 1 … 0", "Bereich wechseln"], ["N", "Neue Aufgabe"], ["?", "Hilfe öffnen"], ["Esc", "Dialog schließen"]];
const ROLES = [["admin", "Admin", "Team und Einstellungen verwalten"], ["member", "Mitarbeiter", "Alles anlegen und bearbeiten"], ["viewer", "Nur lesen", "Sieht alles, ändert nichts"]];
const ROLE_LABEL = { owner: "Inhaber", admin: "Admin", member: "Mitarbeiter", viewer: "Nur lesen" };

function Team() {
  const toast = useToast();
  const session = useSession();
  const [members, setMembers] = useState(null);
  const [adding, setAdding] = useState(null);
  const load = useCallback(() => api("team").then(setMembers).catch(e => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);

  const canManage = m => session.isAdmin && m.role !== "owner" && m.id !== session.user.id && (m.role !== "admin" || session.role === "owner");
  const add = async e => {
    e.preventDefault();
    try { await api("team", { method: "POST", body: adding }); toast(`${adding.name} wurde hinzugefügt`); setAdding(null); load(); }
    catch (err) { toast(err.message, "error"); }
  };
  const role = async (m, value) => {
    try { await api("team/" + m.id, { method: "PATCH", body: { role: value } }); toast("Rolle geändert"); load(); }
    catch (err) { toast(err.message, "error"); }
  };
  const remove = async m => {
    if (!confirmDelete(`${m.name} aus dem Team`)) return;
    try { await api("team/" + m.id, { method: "DELETE" }); toast(`${m.name} entfernt`); load(); }
    catch (err) { toast(err.message, "error"); }
  };

  return (
    <motion.section id="team" className="card" variants={rise} custom={0} initial="hidden" animate="show">
      <h2><FiUsers /> Team · {session.org.name}
        {session.isAdmin && <button className="btn btn--sm" style={{ marginLeft: "auto" }} onClick={() => setAdding({ name: "", email: "", password: "", role: "member" })}><FiUserPlus /> Mitglied</button>}
      </h2>
      <ul className="list">
        <AnimatePresence initial={false}>
          {(members || []).map(m => (
            <motion.li key={m.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }}>
              <span className="avatar" aria-hidden="true">{m.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}</span>
              <span style={{ display: "grid", lineHeight: 1.3, minWidth: 0 }}><b>{m.name}{m.id === session.user.id ? " (Sie)" : ""}</b><small className="muted">{m.email}</small></span>
              <span className="spacer" />
              {canManage(m) ? (
                <>
                  <select className="select" style={{ width: "auto" }} value={m.role} onChange={e => role(m, e.target.value)} aria-label={`Rolle von ${m.name}`}>
                    {ROLES.filter(([r]) => r !== "admin" || session.role === "owner").map(([r, l]) => <option key={r} value={r}>{l}</option>)}
                  </select>
                  <button className="icon-btn" aria-label={`${m.name} entfernen`} onClick={() => remove(m)}><FiTrash2 /></button>
                </>
              ) : <span className={`badge ${m.role === "owner" ? "badge--brass" : ""}`}>{ROLE_LABEL[m.role]}</span>}
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>

      <Modal open={!!adding} onClose={() => setAdding(null)} title="Mitglied hinzufügen"
        footer={<><button className="btn btn--ghost" onClick={() => setAdding(null)}>Abbrechen</button><button className="btn" onClick={add}>Hinzufügen</button></>}>
        {adding && (
          <form className="stack" onSubmit={add}>
            <div className="grid-2">
              <Field label="Name"><input className="input" autoFocus value={adding.name} onChange={e => setAdding({ ...adding, name: e.target.value })} /></Field>
              <Field label="E-Mail"><input className="input" type="email" value={adding.email} onChange={e => setAdding({ ...adding, email: e.target.value })} /></Field>
            </div>
            <Field label="Startpasswort (mind. 10 Zeichen, bitte sicher übermitteln)">
              <input className="input" type="text" autoComplete="off" value={adding.password} onChange={e => setAdding({ ...adding, password: e.target.value })} />
            </Field>
            <Field label="Rolle">
              <div className="stack" style={{ gap: 8 }}>
                {ROLES.filter(([r]) => r !== "admin" || session.role === "owner").map(([r, l, d]) => (
                  <label key={r} className="row" style={{ gap: 10, cursor: "pointer" }}>
                    <input type="radio" name="role" checked={adding.role === r} onChange={() => setAdding({ ...adding, role: r })} style={{ accentColor: "var(--brass)" }} />
                    <b>{l}</b> <span className="muted">{d}</span>
                  </label>
                ))}
              </div>
            </Field>
          </form>
        )}
      </Modal>
    </motion.section>
  );
}

function AuditLog() {
  const [entries, setEntries] = useState(null);
  const [q, setQ] = useState("");
  useEffect(() => { api("activity").then(setEntries).catch(() => setEntries([])); }, []);
  const list = (entries || []).filter(e => !q || `${e.text} ${e.user}`.toLowerCase().includes(q.toLowerCase())).slice(0, 200);
  return (
    <motion.section className="card" variants={rise} custom={2} initial="hidden" animate="show">
      <h2><FiList /> Änderungsprotokoll</h2>
      <input className="input" type="search" placeholder="Nach Person oder Inhalt filtern …" value={q} onChange={e => setQ(e.target.value)} aria-label="Protokoll filtern" />
      <ul className="list feed" style={{ maxHeight: 360, overflow: "auto", marginTop: 10 }}>
        {list.map(e => (
          <li key={e._id}>
            <span>{e.text} <small className="muted">· {e.user || "System"}</small></span>
            <time className="mono" dateTime={e.createdAt}>{new Date(e.createdAt).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time>
          </li>
        ))}
        {entries && !list.length && <li className="muted">Keine Einträge.</li>}
      </ul>
    </motion.section>
  );
}

const PROFILE = [
  ["name", "Firmenname"], ["owner", "Inhaber / Geschäftsführung"], ["street", "Straße und Hausnummer"], ["zip", "PLZ"], ["city", "Ort"],
  ["phone", "Telefon"], ["email", "E-Mail"], ["web", "Website"], ["taxId", "Steuernummer oder USt-IdNr."], ["bank", "Bank"], ["iban", "IBAN"], ["bic", "BIC"],
];

async function readLogo(file) {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5000000) throw new Error("Bitte PNG, JPG oder WebP bis 5 MB wählen.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 480 / bitmap.width, 240 / bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const logo = canvas.toDataURL("image/png");
  if (logo.length > 400000) throw new Error("Bitte ein kleineres Logo wählen.");
  return logo;
}

function FirmProfile() {
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState(null);
  useEffect(() => { api("settings").then(s => setProfile(s.profile)).catch(() => {}); }, []);
  const save = async e => {
    e.preventDefault();
    try { const r = await api("settings", { method: "PUT", body: { profile } }); setProfile(r.profile); router.refresh(); toast("Firmendaten gespeichert"); }
    catch (err) { toast(err.message, "error"); }
  };
  if (!profile) return null;
  const style = profile.logoStyle || {};
  const adjust = patch => setProfile(p => ({ ...p, logoStyle: { ...p.logoStyle, ...patch } }));
  return (
    <motion.form id="firmendaten" className="card stack" onSubmit={save} variants={rise} custom={2} initial="hidden" animate="show">
      <h2><FiFileText /> Firmendaten für Angebote und Rechnungen</h2>
      <p className="muted" style={{ margin: 0 }}>Erscheinen im Briefkopf und in der Fußzeile von Angeboten, Auftragsbestätigungen und Rechnungen.</p>
      <Field label="Firmenlogo hochladen oder ersetzen"><input type="file" accept="image/png,image/jpeg,image/webp" onChange={async e => {
        const file = e.target.files[0]; e.target.value = "";
        if (!file) return;
        try { const logo = await readLogo(file); setProfile(p => ({ ...p, logo, logoStyle: {} })); }
        catch (err) { toast(err.message, "error"); }
      }} /></Field>
      {profile.logo && <><div style={{padding: 20, border: "1px solid currentColor"}}><FirmLogo {...profile} alt="Vorschau Firmenlogo" /></div>
        <div className="grid-2">{[["zoom","Zoom",50,250,100,"%"],["x","Horizontal verschieben",-50,50,0,"%"],["y","Vertikal verschieben",-50,50,0,"%"],["angle","Drehung",-180,180,0,"°"]].map(([key,label,min,max,initial,unit]) =>
          <Field key={key} label={`${label} (${style[key] ?? initial}${unit})`}><input type="range" min={min} max={max} value={style[key] ?? initial} onChange={e => adjust({ [key]: Number(e.target.value) })} /></Field>)}</div>
        <Field label="Hintergrund"><select className="input" value={style.background || "transparent"} onChange={e => adjust({background:e.target.value})}><option value="transparent">Transparent</option><option value="#ffffff">Weiß</option><option value="#18212a">Anthrazit</option></select></Field>
        <label><input type="checkbox" checked={!!style.mono} onChange={e => adjust({mono:e.target.checked})} /> Graustufen</label>
        <button className="btn" type="button" onClick={() => setProfile(p => ({...p, logoStyle:{}, logoWidth:120}))}>Originalansicht wiederherstellen</button>
        <Field label={`Logobreite (${profile.logoWidth} px)`}><input type="range" min="60" max="200" value={profile.logoWidth} onChange={e => setProfile({ ...profile, logoWidth: Number(e.target.value) })} /></Field>
        <button type="button" className="btn" onClick={() => setProfile({ ...profile, logo: "" })}>Logo entfernen</button></>}
      {profile.missingForInvoice?.length > 0 && <div className="notice" style={{ margin: 0 }}>Für Rechnungen (§ 14 UStG) noch nötig: {profile.missingForInvoice.join(", ")}</div>}
      <div className="grid-2">
        {PROFILE.map(([k, l]) => <Field key={k} label={l}><input className="input" value={profile[k]} onChange={e => setProfile({ ...profile, [k]: e.target.value })} /></Field>)}
      </div>
      <label className="row" style={{ gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={!!profile.smallBusiness} onChange={e => setProfile({ ...profile, smallBusiness: e.target.checked })} style={{ accentColor: "var(--brass)", width: 18, height: 18 }} />
        <span><b>Kleinunternehmer nach § 19 UStG</b> – Rechnungen ohne Umsatzsteuer, mit gesetzlichem Hinweis</span>
      </label>
      <Field label="Zahlungsbedingungen (Angebote)"><input className="input" value={profile.terms} onChange={e => setProfile({ ...profile, terms: e.target.value })} /></Field>
      <Field label="Schlusstext (optional)"><textarea className="textarea" style={{ minHeight: 70 }} value={profile.footer} onChange={e => setProfile({ ...profile, footer: e.target.value })} placeholder="z. B. Wir freuen uns auf die Zusammenarbeit." /></Field>
      <div className="row"><span className="spacer" /><button className="btn">Speichern</button></div>
    </motion.form>
  );
}

// Kind of business, visible areas and the AI help. Hidden areas keep their data.
function Workspace() {
  const router = useRouter();
  const toast = useToast();
  const [ws, setWs] = useState(null);
  const [ai, setAi] = useState(null);
  useEffect(() => { api("settings").then(s => { setWs(s.workspace); setAi(s.ai); }).catch(() => {}); }, []);
  if (!ws) return null;
  const toggle = id => setWs(w => ({ ...w, modules: normalizeModules(w.modules.includes(id) ? w.modules.filter(m => m !== id) : [...w.modules, id]) }));
  const locked = id => id === "customers" && (ws.modules.includes("orders") || ws.modules.includes("invoices"));
  const save = async e => {
    e.preventDefault();
    try {
      const patch = { modules: ws.modules, ai: ws.ai, ...(ws.industry ? { industry: ws.industry } : {}) };
      const r = await api("settings", { method: "PUT", body: { workspace: patch } });
      setWs(r.workspace); router.refresh(); toast("Arbeitsbereich gespeichert");
    } catch (err) { toast(err.message, "error"); }
  };
  return (
    <motion.form id="arbeitsbereich" className="card stack" onSubmit={save} variants={rise} custom={1} initial="hidden" animate="show">
      <h2><FiLayers /> Arbeitsbereich</h2>
      <p className="muted" style={{ margin: 0 }}>Blenden Sie aus, was Ihr Betrieb nicht braucht. Die Daten ausgeblendeter Bereiche bleiben erhalten.</p>
      <Field label="Branche (setzt eine passende Auswahl)">
        <select className="select" value={ws.industry} onChange={e => { const preset = INDUSTRIES.find(i => i[0] === e.target.value); setWs({ ...ws, industry: e.target.value, modules: normalizeModules(preset ? preset[3] : ws.modules) }); }}>
          <option value="" disabled>Bitte wählen …</option>
          {INDUSTRIES.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
      </Field>
      <div className="areas">
        {MODULES.map(([id, , title, text]) => (
          <label key={id} className={locked(id) ? "areas__locked" : ""} title={locked(id) ? "Wird für Aufträge und Rechnungen gebraucht" : undefined}>
            <input type="checkbox" checked={ws.modules.includes(id)} disabled={locked(id)} onChange={() => toggle(id)} />
            <span><b>{title}</b><small>{text}</small></span>
          </label>
        ))}
      </div>
      <hr className="stitch" />
      <label className="row" style={{ gap: 10, cursor: "pointer", alignItems: "flex-start" }}>
        <input type="checkbox" checked={ws.ai} onChange={e => setWs({ ...ws, ai: e.target.checked })} style={{ accentColor: "var(--brass)", width: 18, height: 18, marginTop: 3 }} />
        <span><b><FiHelpCircle style={{ verticalAlign: "-2px" }} /> KI-Assistent in der Hilfe</b><br />
          <span className="muted">{!ai?.configured ? "Auf diesem Server ist keine KI eingerichtet. Die Hilfe antwortet aus der eingebauten Anleitung."
            : ai.local ? `Verbunden mit „${ai.model}“ auf dem eigenen Server. Fragen verlassen das Haus nicht.`
            : `Verbunden mit „${ai.model}“ bei einem externen Anbieter. Übertragen werden die Frage und die Anleitung, keine Kunden- oder Rechnungsdaten.`}</span></span>
      </label>
      <div className="row"><span className="spacer" /><button className="btn">Speichern</button></div>
    </motion.form>
  );
}

function CalendarFeed() {
  const toast = useToast();
  const [active, setActive] = useState(false);
  const [link, setLink] = useState("");
  useEffect(() => { api("ical").then(r => setActive(r.active)).catch(() => {}); }, []);

  const create = async () => {
    if (active && !window.confirm("Ein neuer Link ersetzt den alten. Bestehende Abos müssen neu eingerichtet werden. Fortfahren?")) return;
    try { const { token } = await api("ical", { method: "POST" }); setLink(`${window.location.origin}/api/ical/${token}.ics`); setActive(true); }
    catch (err) { toast(err.message, "error"); }
  };
  const revoke = async () => {
    try { await api("ical", { method: "DELETE" }); setActive(false); setLink(""); toast("Kalender-Abo deaktiviert"); }
    catch (err) { toast(err.message, "error"); }
  };
  const copy = async () => { try { await navigator.clipboard.writeText(link); toast("Link kopiert"); } catch { toast("Bitte den Link manuell kopieren.", "error"); } };

  return (
    <motion.section className="card stack" variants={rise} custom={2} initial="hidden" animate="show">
      <h2><FiCalendar /> Kalender-Abo (Outlook, Google, iPhone)</h2>
      <p className="muted" style={{ margin: 0 }}>Termine und fällige Aufgaben erscheinen automatisch im eigenen Kalender. Wer den Link hat, kann die Termine lesen – nur an Ihr Team weitergeben.</p>
      {link && (
        <div className="stack" style={{ gap: 8 }}>
          <input className="input mono" readOnly value={link} onFocus={e => e.target.select()} aria-label="Abo-Link" />
          <div className="row">
            <button className="btn btn--sm" onClick={copy}><FiCopy /> Kopieren</button>
            <a className="btn btn--ghost btn--sm" href={link.replace(/^https?:/, "webcal:")}>In Kalender-App öffnen</a>
          </div>
          <small className="muted">Der Link wird nur jetzt angezeigt. Bei Verlust einfach einen neuen erzeugen.</small>
        </div>
      )}
      <div className="row">
        <span className={`badge ${active ? "badge--ok" : ""}`}>{active ? "Aktiv" : "Aus"}</span>
        <span className="spacer" />
        {active && <button className="btn btn--ghost btn--sm" onClick={revoke}>Deaktivieren</button>}
        <button className="btn btn--sm" onClick={create}><FiLink /> {active ? "Neuen Link erzeugen" : "Abo-Link erzeugen"}</button>
      </div>
    </motion.section>
  );
}

function FirmData() {
  const toast = useToast();
  const session = useSession();
  const [info, setInfo] = useState(null);
  const [confirmName, setConfirmName] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { api("org").then(setInfo).catch(() => {}); }, []);

  const remove = async () => {
    try { await api("org", { method: "DELETE", body: { confirm: confirmName } }); window.location.href = "/register"; }
    catch (err) { toast(err.message, "error"); }
  };

  return (
    <motion.section className="card stack" variants={rise} custom={3} initial="hidden" animate="show">
      <h2><FiHardDrive /> Firma & Datenbank</h2>
      <ul className="list">
        <li><span>Firma</span><span className="spacer" /><b>{session.org.name}</b></li>
        <li><span>Eigene Datenbank</span><span className="spacer" /><span className="badge badge--ok">getrennt gespeichert</span></li>
        <li><span>Größe</span><span className="spacer" /><span className="mono">{info ? `${Math.max(1, Math.round(info.databaseBytes / 1024))} KB` : "…"}</span></li>
        <li><span>Mitglieder</span><span className="spacer" /><span className="mono">{info?.members ?? "…"}</span></li>
        {session.isAdmin && <li><span>Firmen-ID (für Sicherungen)</span><span className="spacer" /><span className="mono muted">{info?.id ?? "…"}</span></li>}
      </ul>
      {session.role === "owner" && (
        <>
          <hr className="stitch" />
          <p className="muted" style={{ margin: 0 }}>Firma mit allen Daten endgültig löschen (z. B. bei Kündigung). Rechnungen müssen 10 Jahre aufbewahrt werden (§ 147 AO) – vorher unbedingt den Gesamtexport und die Rechnungs-PDFs sichern.</p>
          <div className="row"><span className="spacer" /><button className="btn btn--danger btn--sm" onClick={() => setOpen(true)}><FiTrash2 /> Firma löschen</button></div>
          <Modal open={open} onClose={() => { setOpen(false); setConfirmName(""); }} title="Firma endgültig löschen"
            footer={<><button className="btn btn--ghost" onClick={() => setOpen(false)}>Abbrechen</button>
              <button className="btn btn--danger" disabled={confirmName.trim() !== session.org.name} onClick={remove}><FiTrash2 /> Endgültig löschen</button></>}>
            <div className="stack">
              <p style={{ margin: 0 }}>Alle Aufgaben, Projekte, Artikel, Notizen, Termine, das Protokoll und alle Team-Zugänge von <b>{session.org.name}</b> werden gelöscht. Das lässt sich nicht rückgängig machen.</p>
              <Field label={`Zur Bestätigung „${session.org.name}“ eingeben`}>
                <input className="input" value={confirmName} onChange={e => setConfirmName(e.target.value)} autoComplete="off" />
              </Field>
            </div>
          </Modal>
        </>
      )}
    </motion.section>
  );
}

function Password() {
  const toast = useToast();
  const [form, setForm] = useState({ current: "", next: "" });
  const save = async e => {
    e.preventDefault();
    try { await api("auth/password", { method: "POST", body: form }); toast("Passwort geändert – andere Geräte wurden abgemeldet"); setForm({ current: "", next: "" }); }
    catch (err) { toast(err.message, "error"); }
  };
  return (
    <motion.form className="card stack" onSubmit={save} variants={rise} custom={3} initial="hidden" animate="show">
      <h2><FiKey /> Mein Passwort</h2>
      <div className="grid-2">
        <Field label="Aktuelles Passwort"><input className="input" type="password" autoComplete="current-password" value={form.current} onChange={e => setForm({ ...form, current: e.target.value })} /></Field>
        <Field label="Neues Passwort (mind. 10 Zeichen)"><input className="input" type="password" autoComplete="new-password" value={form.next} onChange={e => setForm({ ...form, next: e.target.value })} /></Field>
      </div>
      <div className="row"><span className="spacer" /><button className="btn btn--ghost" disabled={!form.current || form.next.length < 10}>Passwort ändern</button></div>
    </motion.form>
  );
}

export default function Admin() {
  const toast = useToast();
  const session = useSession();
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { api("settings").then(s => setAnnouncement(s.announcement)).catch(e => toast(e.message, "error")); }, [toast]);

  const save = async e => {
    e.preventDefault();
    setBusy(true);
    try { await api("settings", { method: "PUT", body: { announcement } }); toast("Mitteilung gespeichert"); }
    catch (err) { toast(err.message, "error"); } finally { setBusy(false); }
  };

  return (
    <>
      <PageHead eyebrow="Team · Einstellungen · Daten" title="Verwaltung" text="Mitglieder und Rollen verwalten, Mitteilungen setzen und Daten exportieren." />
      <div className="dash">
        <div className="stack">
          <Team />
          {session.isAdmin && (
            <motion.form className="card stack" onSubmit={save} variants={rise} custom={1} initial="hidden" animate="show">
              <h2><FiBell /> Mitteilung auf der Übersicht</h2>
              <Field label={`Text (${announcement.length}/500)`}>
                <textarea className="textarea" maxLength={500} value={announcement} onChange={e => setAnnouncement(e.target.value)} placeholder="z. B. Freitag ab 14 Uhr Inventur im Lager." />
              </Field>
              <div className="row"><span className="spacer" /><button className="btn" disabled={busy}>Speichern</button></div>
            </motion.form>
          )}
          {session.isAdmin && <Workspace />}
          {session.isAdmin && <FirmProfile />}
          {session.isAdmin && <CalendarFeed />}
          <Password />
          <FirmData />
        </div>
        <div className="stack">
          <motion.section className="card" variants={rise} custom={1} initial="hidden" animate="show">
            <h2><FiDownload /> Export (CSV für Excel)</h2>
            <div className="row">{EXPORTS.filter(([, , area]) => session.has(area)).map(([k, l]) => <a key={k} className="btn btn--ghost btn--sm" href={`/api/export/${k}`}><FiDownload /> {l}</a>)}</div>
            {session.isAdmin && (<>
              <hr className="stitch" />
              <p className="muted" style={{ marginTop: 0 }}>Alle Daten der Firma als eine Datei, z. B. für einen Anbieterwechsel oder eine Datenauskunft.</p>
              <a className="btn btn--sm" href="/api/export/all"><FiDatabase /> Gesamtexport (JSON)</a>
            </>)}
          </motion.section>
          {session.isAdmin && <AuditLog />}
          <motion.section className="card" variants={rise} custom={2} initial="hidden" animate="show">
            <h2><FiCommand /> Tastenkürzel</h2>
            <ul className="list">{SHORTCUTS.map(([k, l]) => <li key={k}><kbd>{k}</kbd><span>{l}</span></li>)}</ul>
          </motion.section>
        </div>
      </div>
    </>
  );
}
