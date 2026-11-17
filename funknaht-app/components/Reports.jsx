"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { FiBarChart2, FiUsers, FiCreditCard, FiPercent, FiClock, FiPrinter } from "react-icons/fi";
import { api, fmtMoney } from "@/lib/client";
import { PageHead, Skeleton, Counter, rise } from "./ui";
import { useSession } from "./Shell";

const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
const hours = m => `${Math.round(m / 60).toLocaleString("de-DE")} Std.`;

// Two bars per month: revenue and expenses (net). Values are also in the table below.
function Bars({ months }) {
  const max = Math.max(1, ...months.flatMap(m => [m.revenueNet, m.expensesNet]));
  const w = 720, h = 200, step = w / 12, bar = step * 0.3;
  const y = v => h - 24 - (Math.max(0, v) / max) * (h - 40);
  return (
    <svg className="bars" viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Umsatz und Ausgaben je Monat">
      {months.map((m, i) => (
        <g key={m.month}>
          <motion.rect x={i * step + step * 0.16} width={bar} rx="3" fill="var(--brass)" initial={{ y: h - 24, height: 0 }} animate={{ y: y(m.revenueNet), height: h - 24 - y(m.revenueNet) }} transition={{ duration: 0.7, delay: i * 0.03 }}><title>{`${MONTHS[i]}: Umsatz ${fmtMoney(m.revenueNet)}`}</title></motion.rect>
          <motion.rect x={i * step + step * 0.16 + bar + 3} width={bar} rx="3" fill="var(--fjord)" initial={{ y: h - 24, height: 0 }} animate={{ y: y(m.expensesNet), height: h - 24 - y(m.expensesNet) }} transition={{ duration: 0.7, delay: i * 0.03 }}><title>{`${MONTHS[i]}: Ausgaben ${fmtMoney(m.expensesNet)}`}</title></motion.rect>
          <text x={i * step + step / 2} y={h - 6} textAnchor="middle" fontSize="11" fill="var(--ink-3)">{MONTHS[i]}</text>
        </g>
      ))}
      <line x1="0" x2={w} y1={h - 24} y2={h - 24} stroke="var(--line-2)" />
    </svg>
  );
}

export default function Reports() {
  const { has, isAdmin } = useSession();
  const [year, setYear] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { setData(null); api("reports?year=" + year).then(setData).catch(e => setError(e.message)); }, [year]);

  if (error) return <div className="notice">{error}</div>;
  const t = data?.totals;
  return (
    <>
      <PageHead eyebrow="Umsatz · Ausgaben · Ergebnis" title="Berichte" text="Alle Beträge netto, sofern nicht anders angegeben. Grundlage sind gestellte Rechnungen und erfasste Ausgaben.">
        <select className="select" style={{ width: "auto" }} value={year} onChange={e => setYear(Number(e.target.value))} aria-label="Jahr">
          {(data?.years || [year]).map(y => <option key={y}>{y}</option>)}
        </select>
        <button className="btn btn--ghost" onClick={() => window.print()}><FiPrinter /> Drucken</button>
      </PageHead>

      {!data ? <Skeleton rows={4} height={90} /> : (
        <>
          <motion.div className="stats" initial="hidden" animate="show">
            {[["Umsatz", t.revenueNet, "gestellte Rechnungen"], ["Ausgaben", t.expensesNet, `${data.categories.length} ${data.categories.length === 1 ? "Kategorie" : "Kategorien"}`], ["Ergebnis", t.result, "Umsatz minus Ausgaben"], ["Offene Rechnungen", data.receivables.open, data.receivables.overdue ? `davon überfällig ${fmtMoney(data.receivables.overdue)}` : `${data.receivables.count} ${data.receivables.count === 1 ? "Rechnung" : "Rechnungen"}`]].map(([label, value, sub], i) => (
              <motion.div key={label} className="card stat" variants={rise} custom={i}>
                <small>{label}</small>
                <strong style={{ color: label === "Ergebnis" && value < 0 ? "var(--err)" : undefined }}><Counter value={value} format={fmtMoney} /></strong>
                <span>{sub}</span>
              </motion.div>
            ))}
          </motion.div>

          <motion.section className="card" variants={rise} custom={2} initial="hidden" animate="show">
            <h2><FiBarChart2 /> Verlauf {data.year}
              <span className="legend"><i style={{ background: "var(--brass)" }} /> Umsatz <i style={{ background: "var(--fjord)" }} /> Ausgaben</span>
            </h2>
            <Bars months={data.months} />
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table>
                <thead><tr><th>Monat</th><th className="num">Umsatz</th><th className="num">Zahlungseingang</th><th className="num">Ausgaben</th><th className="num">Ergebnis</th></tr></thead>
                <tbody>
                  {data.months.map((m, i) => (
                    <tr key={m.month}><td>{MONTHS[i]}</td><td className="num">{fmtMoney(m.revenueNet)}</td><td className="num">{fmtMoney(m.received)}</td><td className="num">{fmtMoney(m.expensesNet)}</td>
                      <td className="num" style={{ color: m.result < 0 ? "var(--err)" : undefined }}>{fmtMoney(m.result)}</td></tr>
                  ))}
                  <tr><td><b>Jahr</b></td><td className="num"><b>{fmtMoney(t.revenueNet)}</b></td><td className="num"><b>{fmtMoney(t.received)}</b></td><td className="num"><b>{fmtMoney(t.expensesNet)}</b></td><td className="num"><b>{fmtMoney(t.result)}</b></td></tr>
                </tbody>
              </table>
            </div>
          </motion.section>

          <div className="dash" style={{ marginTop: 14 }}>
            <div className="stack">
              <motion.section className="card" variants={rise} custom={3} initial="hidden" animate="show">
                <h2><FiUsers /> Umsatzstärkste Kunden {has("customers") && <Link href="/customers">Kunden →</Link>}</h2>
                {data.topCustomers.length ? (
                  <ul className="list">{data.topCustomers.map(c => (
                    <li key={c.name}><span>{c.name}</span><span className="muted">· {c.count} {c.count === 1 ? "Rechnung" : "Rechnungen"}</span><span className="spacer" /><b>{fmtMoney(c.net)}</b></li>
                  ))}</ul>
                ) : <p className="muted">In {data.year} wurden noch keine Rechnungen gestellt.</p>}
              </motion.section>
              <motion.section className="card" variants={rise} custom={4} initial="hidden" animate="show">
                <h2><FiPercent /> Umsatzsteuer {data.year}</h2>
                <ul className="list">
                  <li><span>Umsatzsteuer aus Rechnungen</span><span className="spacer" /><b>{fmtMoney(t.vatOut)}</b></li>
                  <li><span>Vorsteuer aus Ausgaben</span><span className="spacer" /><b>{fmtMoney(t.vatIn)}</b></li>
                  <li><span>Differenz</span><span className="spacer" /><b>{fmtMoney(t.vatOut - t.vatIn)}</b></li>
                </ul>
                <p className="muted" style={{ marginBottom: 0 }}>Nur zur Orientierung. Die Voranmeldung richtet sich nach Ihrer Versteuerungsart und gehört in die Buchhaltung oder zur Steuerberatung.</p>
              </motion.section>
            </div>
            <div className="stack">
              <motion.section className="card" variants={rise} custom={3} initial="hidden" animate="show">
                <h2><FiCreditCard /> Ausgaben nach Kategorie {has("expenses") && <Link href="/expenses">Ausgaben →</Link>}</h2>
                {data.categories.length ? (
                  <ul className="list">{data.categories.map(c => (
                    <li key={c.name}><span style={{ minWidth: 150 }}>{c.name}</span><div className="progress"><motion.i initial={{ width: 0 }} animate={{ width: (c.net / data.categories[0].net) * 100 + "%" }} transition={{ duration: 0.8 }} /></div><b style={{ minWidth: 96, textAlign: "right" }}>{fmtMoney(c.net)}</b></li>
                  ))}</ul>
                ) : <p className="muted">In {data.year} wurden noch keine Ausgaben erfasst.</p>}
              </motion.section>
              {has("times") && data.people.length > 0 && (
                <motion.section className="card" variants={rise} custom={4} initial="hidden" animate="show">
                  <h2><FiClock /> Arbeitszeit {data.year} <Link href="/times">Zeiterfassung →</Link></h2>
                  <ul className="list">{data.people.map(p => (
                    <li key={p.name}><span>{isAdmin ? p.name : "Meine Zeiten"}</span><span className="muted">· {p.urlaub} Urlaub · {p.krank} krank</span><span className="spacer" /><b>{hours(p.minutes)}</b></li>
                  ))}</ul>
                </motion.section>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
}
