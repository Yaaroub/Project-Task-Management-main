"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { FiArrowUpRight, FiCheckSquare, FiAlertTriangle, FiPackage, FiClock, FiActivity, FiCalendar, FiFolder, FiBell, FiBriefcase, FiFileText, FiUsers, FiCheckCircle, FiCircle, FiCompass, FiX } from "react-icons/fi";
import HeroMotion from "./HeroMotion";
import { Counter, rise } from "./ui";
import { api, fmtDate, fmtMinutes, fmtMoney, relTime, todayKey } from "@/lib/client";
import { INDUSTRIES } from "@/lib/workspace-shared";
import { useSession } from "./Shell";

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend";
}

function Sparkline({ trend }) {
  const max = Math.max(1, ...trend.map(t => t.count));
  const w = 300, h = 90;
  const pts = trend.map((t, i) => [(i / (trend.length - 1)) * w, h - 8 - (t.count / max) * (h - 20)]);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" role="img" aria-label="Erledigte Aufgaben der letzten 14 Tage">
      <defs><linearGradient id="sparkFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--brass)" stopOpacity=".35" /><stop offset="1" stopColor="var(--brass)" stopOpacity="0" /></linearGradient></defs>
      <motion.path d={`${line} L${w} ${h} L0 ${h} Z`} fill="url(#sparkFill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }} />
      <motion.path d={line} fill="none" stroke="var(--brass)" strokeWidth="2.2" vectorEffect="non-scaling-stroke"
        initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r="2.4" fill="var(--brass)"><title>{`${fmtDate(trend[i].day)}: ${trend[i].count}`}</title></circle>)}
    </svg>
  );
}

// First visit: one click on the kind of business hides everything the firm does not need.
function IndustryPicker() {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const choose = async (id, modules) => {
    setBusy(id);
    try { await api("settings", { method: "PUT", body: { workspace: { industry: id, modules } } }); router.refresh(); } finally { setBusy(""); }
  };
  return (
    <motion.section className="card setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <h2><FiCompass /> Was für ein Betrieb sind Sie?</h2>
      <p className="muted">Nahtbord zeigt dann nur die Bereiche, die Sie brauchen. Das lässt sich unter Verwaltung jederzeit ändern.</p>
      <div className="industries">
        {INDUSTRIES.map(([id, title, text, modules]) => (
          <button key={id} disabled={!!busy} onClick={() => choose(id, modules)}><b>{title}</b><span>{text}</span></button>
        ))}
      </div>
    </motion.section>
  );
}

// "Erste Schritte": what is still missing until the firm can work with Nahtbord.
function Setup({ setup, isAdmin }) {
  const router = useRouter();
  const done = setup.steps.filter(s => s.done).length;
  const hide = async () => { await api("settings", { method: "PUT", body: { workspace: { setupDismissed: true } } }).catch(() => {}); router.refresh(); };
  return (
    <motion.section className="card setup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <h2><FiCheckCircle /> Erste Schritte <span className="badge">{done} von {setup.steps.length} erledigt</span>
        {isAdmin && <button className="icon-btn" onClick={hide} aria-label="Erste Schritte ausblenden" title="Ausblenden"><FiX /></button>}
      </h2>
      <div className="progress"><motion.i initial={{ width: 0 }} animate={{ width: (done / setup.steps.length) * 100 + "%" }} transition={{ duration: 0.8 }} /></div>
      <ul className="list">
        {setup.steps.map(step => (
          <li key={step.id} className={step.done ? "setup__done" : ""}>
            {step.done ? <FiCheckCircle /> : <FiCircle />}
            <span><b>{step.title}</b> <span className="muted">{step.text}</span></span>
            <span className="spacer" />
            {!step.done && <Link className="btn btn--ghost btn--sm" href={step.href}>Los</Link>}
          </li>
        ))}
      </ul>
    </motion.section>
  );
}

export default function Dashboard({ data, userName, setup, industry }) {
  const { has, nav, isAdmin, canEdit } = useSession();
  const [person, setPerson] = useState("");
  const people = new Map(data.activity.filter(a => a.userId).map(a => [a.userId,a.user]));
  const entries = data.activity.filter(a => !person || a.userId === person).slice(0,12);
  const firstName = (userName || "").split(/\s+/)[0];
  const { counts } = data;
  const today = todayKey();
  const rate = counts.tasks ? Math.round((counts.done / counts.tasks) * 100) : 0;
  // Four figures from the areas the firm uses, in this order of preference.
  const stats = [
    has("tasks") && [FiCheckSquare, "Offene Aufgaben", counts.open, `${counts.doing} in Arbeit · ${rate} % erledigt`],
    has("tasks") && [FiAlertTriangle, "Überfällig", counts.overdue, counts.overdue ? "Bitte zeitnah prüfen" : "Alles im Plan"],
    has("inventory") && [FiPackage, "Lagerwert", counts.stockValue, `${counts.lowStock} unter Mindestbestand`, fmtMoney],
    has("tasks") && [FiClock, "Erfasste Zeit", counts.minutes, `${counts.projects} aktive Projekte`, fmtMinutes],
    has("invoices") && [FiFileText, "Offene Rechnungen", data.invoices.open.value, data.invoices.overdue.count ? `${data.invoices.overdue.count} überfällig` : "Keine überfällig", fmtMoney],
    has("orders") && [FiBriefcase, "Aufträge in Arbeit", data.orders.active.count, `${data.orders.offers.count} Angebote offen`],
    has("customers") && [FiUsers, "Kunden", counts.customers, "in der Kartei"],
    has("calendar") && [FiCalendar, "Anstehende Termine", counts.events, "ab heute"],
  ].filter(Boolean).slice(0, 4);
  const first = nav.find(n => n[4]); // first area in the menu, used when the task board is off

  return (
    <>
      {data.announcement && (
        <motion.div className="notice" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}><FiBell /> {data.announcement}</motion.div>
      )}
      <section className="hero">
        <HeroMotion />
        <motion.div className="hero__copy" initial="hidden" animate="show">
          <motion.div className="eyebrow" variants={rise} custom={0}>Nahtbord · {fmtDate(Date.now(), { weekday: "long", day: "numeric", month: "long" })}</motion.div>
          <motion.h1 variants={rise} custom={1}>{greeting()}{firstName ? `, ${firstName}` : ""}. <em>Was steht heute an?</em></motion.h1>
          <motion.p variants={rise} custom={2}>Alles für den Arbeitstag an einem Ort, aufgeräumt.</motion.p>
          <motion.div className="row" variants={rise} custom={3}>
            {has("tasks") ? (<>
              <Link className="btn" href="/tasks">Zum Board <FiArrowUpRight /></Link>
              {canEdit && <Link className="btn btn--ghost" style={{ color: "#EEF5F4" }} href="/tasks?new=1">Aufgabe anlegen</Link>}
            </>) : first && <Link className="btn" href={first[0]}>{first[1]} öffnen <FiArrowUpRight /></Link>}
          </motion.div>
        </motion.div>
      </section>

      {isAdmin && !industry ? <IndustryPicker /> : !setup.dismissed && !setup.done && <Setup setup={setup} isAdmin={isAdmin} />}

      <motion.div className="stats" initial="hidden" animate="show">
        {stats.map(([Icon, label, value, sub, format], i) => (
          <motion.div key={label} className="card stat" variants={rise} custom={i + 2} whileHover={{ y: -3 }}>
            <small><Icon /> {label}</small>
            <strong><Counter value={value} format={format} /></strong>
            <span>{sub}</span>
          </motion.div>
        ))}
      </motion.div>

      <div className="dash">
        <div className="stack">
          {(has("orders") || has("invoices")) && <motion.section className="card" variants={rise} custom={2} initial="hidden" animate="show">
            <h2>{has("orders") ? <><FiBriefcase /> Auftragslage <Link href="/orders">Aufträge →</Link></> : <><FiFileText /> Rechnungen <Link href="/invoices">Rechnungen →</Link></>}</h2>
            {has("orders") && <div className="pipeline">
              {[["Anfragen", data.orders.requests, "var(--slate)"], ["Angebote offen", data.orders.offers, "var(--fjord)"], ["Beauftragt & in Arbeit", data.orders.active, "var(--brass)"], ["Abzurechnen", data.orders.toBill, "var(--ok)"]].map(([label, g, color]) => (
                <Link key={label} href="/orders" className="pipeline__step" style={{ "--c": color }}>
                  <small>{label}</small>
                  <strong><Counter value={g.value} format={fmtMoney} /></strong>
                  <span>{g.count} {g.count === 1 ? "Auftrag" : "Aufträge"}</span>
                </Link>
              ))}
            </div>}
            {has("invoices") && <Link href="/invoices" className="invoice-strip">
              <FiFileText />
              <span>Offene Rechnungen <b>{fmtMoney(data.invoices.open.value)}</b> ({data.invoices.open.count})</span>
              {data.invoices.overdue.count > 0 && <span className="badge badge--err">davon überfällig {fmtMoney(data.invoices.overdue.value)}</span>}
              {data.invoices.drafts > 0 && <span className="badge">{data.invoices.drafts} {data.invoices.drafts === 1 ? "Entwurf" : "Entwürfe"}</span>}
              <span className="spacer" />→
            </Link>}
            {has("orders") && data.orders.upcoming.length > 0 && (
              <ul className="list" style={{ marginTop: 12 }}>
                {data.orders.upcoming.map(o => (
                  <li key={o._id}>
                    <span className="mono muted">{o.number}</span>
                    <Link href={`/orders?open=${o._id}`}>{o.title}</Link>
                    <span className="muted">· {o.customer}</span>
                    <span className="spacer" />
                    <span className={`badge ${o.dueDate < today ? "badge--err" : ""}`}>{fmtDate(o.dueDate)}</span>
                  </li>
                ))}
              </ul>
            )}
          </motion.section>}
          {has("tasks") && <motion.section className="card" variants={rise} custom={3} initial="hidden" animate="show">
            <h2><FiActivity /> Erledigt in den letzten 14 Tagen</h2>
            <Sparkline trend={data.trend} />
          </motion.section>}
          {has("tasks") && <motion.section className="card" variants={rise} custom={4} initial="hidden" animate="show">
            <h2><FiCheckSquare /> Als Nächstes fällig <Link href="/tasks">Alle Aufgaben →</Link></h2>
            {data.upcoming.length ? (
              <ul className="list">
                {data.upcoming.map(t => (
                  <li key={t._id}>
                    <span className={`dot prio-${t.priority}`} style={{ background: "var(--c)" }} />
                    <Link href={`/tasks?open=${t._id}`}>{t.headline}</Link>
                    <span className={`spacer`} />
                    <span className={`badge ${t.dueDate < today ? "badge--err" : t.dueDate === today ? "badge--warn" : ""}`}>
                      {t.dueDate < today ? "überfällig · " : t.dueDate === today ? "heute · " : ""}{fmtDate(t.dueDate)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Keine fälligen Aufgaben. Schön ruhig hier.</p>}
          </motion.section>}
          {has("projects") && <motion.section className="card" variants={rise} custom={5} initial="hidden" animate="show">
            <h2><FiFolder /> Projektfortschritt <Link href="/projects">Projekte →</Link></h2>
            {data.projects.length ? (
              <ul className="list">
                {data.projects.map(p => {
                  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;
                  return (
                    <li key={p._id} className={`c-${p.color}`}>
                      <span style={{ minWidth: 140 }}>{p.name}</span>
                      <div className="progress"><motion.i initial={{ width: 0 }} animate={{ width: pct + "%" }} transition={{ duration: 1, delay: 0.3 }} /></div>
                      <span className="mono muted" style={{ width: 70, textAlign: "right" }}>{p.done}/{p.total}</span>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="muted">Noch keine Projekte angelegt.</p>}
          </motion.section>}
        </div>

        <div className="stack">
          {has("calendar") && <motion.section className="card" variants={rise} custom={4} initial="hidden" animate="show">
            <h2><FiCalendar /> Termine <Link href="/calendar">Kalender →</Link></h2>
            {data.agenda.length ? (
              <ul className="list">
                {data.agenda.map(e => (
                  <li key={e._id} className={`c-${e.color}`}>
                    <span className="dot" style={{ background: "var(--c)" }} />
                    <span>{e.title}</span><span className="spacer" />
                    <span className="mono muted">{fmtDate(e.startDate, { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Keine anstehenden Termine.</p>}
          </motion.section>}
          {has("inventory") && data.lowStock.length > 0 && (
            <motion.section className="card" variants={rise} custom={5} initial="hidden" animate="show">
              <h2><FiPackage /> Nachbestellen <Link href="/inventory">Inventar →</Link></h2>
              <ul className="list">
                {data.lowStock.map(p => (
                  <li key={p._id}><span>{p.title}</span><span className="spacer" /><span className="badge badge--err">{p.stock} / min. {p.minStock}</span></li>
                ))}
              </ul>
            </motion.section>
          )}
          <motion.section className="card" variants={rise} custom={6} initial="hidden" animate="show">
            <h2><FiActivity /> Mitarbeiteraktivitäten</h2>
            <label>Teammitglied <select className="input" value={person} onChange={e => setPerson(e.target.value)}><option value="">Gesamtes Team</option>{Array.from(people).map(([id,name]) => <option key={id} value={id}>{name}</option>)}</select></label>
            {entries.length ? (
              <ul className="list feed">
                {entries.map((a, i) => (
                  <motion.li key={a._id} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.4 + i * 0.04 }}>
                    <span><strong>{a.user || "Team"}</strong><br />{a.text}</span><time suppressHydrationWarning dateTime={a.createdAt}>{relTime(a.createdAt)}</time>
                  </motion.li>
                ))}
              </ul>
            ) : <p className="muted">Noch keine Aktivität.</p>}
          </motion.section>
        </div>
      </div>
    </>
  );
}
