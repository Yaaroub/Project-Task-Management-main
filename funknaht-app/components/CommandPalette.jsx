"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { FiArrowRight, FiCheckSquare, FiFolder, FiEdit3, FiPackage, FiCalendar, FiPlus, FiSun, FiBriefcase, FiUsers, FiFileText, FiHelpCircle } from "react-icons/fi";
import { api } from "@/lib/client";
import { NAV, useSession } from "./Shell";

const ICONS = { invoices: FiFileText, orders: FiBriefcase, customers: FiUsers, tasks: FiCheckSquare, projects: FiFolder, notes: FiEdit3, products: FiPackage, events: FiCalendar };

export default function CommandPalette({ open, onClose, toggleTheme, openHelp }) {
  const router = useRouter();
  const { modules, canEdit } = useSession();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState([]);
  const [index, setIndex] = useState(0);
  const input = useRef(null);

  useEffect(() => { if (open) { setQ(""); setHits([]); setIndex(0); setTimeout(() => input.current?.focus(), 30); } }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(() => api("search?q=" + encodeURIComponent(q)).then(setHits).catch(() => setHits([])), 160);
    return () => clearTimeout(t);
  }, [q]);

  const items = useMemo(() => {
    // Only actions and areas the firm has switched on.
    const create = [["orders", "Neuer Auftrag", "/orders?new=1"], ["invoices", "Neue Rechnung", "/invoices?new=1"], ["customers", "Neuer Kunde", "/customers?new=1"],
      ["tasks", "Neue Aufgabe", "/tasks?new=1"], ["notes", "Neue Notiz", "/notes?new=1"], ["calendar", "Neuer Termin", "/calendar?new=1"],
      ["times", "Zeit eintragen", "/times?new=1"], ["expenses", "Neue Ausgabe", "/expenses?new=1"]]
      .filter(([area]) => canEdit && modules.includes(area)).map(([, title, href]) => ({ title, label: "Aktion", icon: FiPlus, href }));
    const actions = [
      ...create,
      { title: "Hilfe öffnen", label: "Aktion", icon: FiHelpCircle, run: openHelp },
      { title: "Design wechseln", label: "Aktion", icon: FiSun, run: toggleTheme },
      ...NAV.filter(n => !n[4] || modules.includes(n[4])).map(([href, title, icon]) => ({ title, label: "Gehe zu", icon, href })),
    ].filter(a => a.title.toLowerCase().includes(q.trim().toLowerCase()));
    return [...hits.map(h => ({ ...h, icon: ICONS[h.area] })), ...actions];
  }, [hits, q, toggleTheme, openHelp, modules, canEdit]);

  const choose = item => {
    onClose();
    if (item.run) item.run(); else router.push(item.href);
  };
  const onKey = e => {
    if (e.key === "ArrowDown") { e.preventDefault(); setIndex(i => Math.min(i + 1, items.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setIndex(i => Math.max(i - 1, 0)); }
    if (e.key === "Enter" && items[index]) choose(items[index]);
    if (e.key === "Escape") onClose();
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className="modal palette" role="dialog" aria-label="Suche" initial={{ opacity: 0, y: -16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }}>
            <input ref={input} value={q} onChange={e => { setQ(e.target.value); setIndex(0); }} onKeyDown={onKey}
              placeholder="Aufgaben, Notizen, Artikel suchen oder Aktion wählen …" aria-label="Suchbegriff" />
            <ul role="listbox">
              {items.map((item, i) => {
                const Icon = item.icon || FiArrowRight;
                return (
                  <li key={item.title + item.href + i} role="option" aria-selected={i === index} onMouseEnter={() => setIndex(i)}>
                    <button onClick={() => choose(item)}><Icon /> {item.title} <small>{item.label}</small></button>
                  </li>
                );
              })}
              {!items.length && <li className="muted" style={{ padding: 14 }}>Nichts gefunden.</li>}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
