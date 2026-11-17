"use client";
import FirmLogo from "@/components/FirmLogo";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, Fragment, useContext, useEffect, useState } from "react";
import { motion } from "framer-motion";
import { FiGrid, FiFolder, FiCheckSquare, FiPackage, FiEdit3, FiCalendar, FiSliders, FiSearch, FiSun, FiMoon, FiMenu, FiPlus, FiLogOut, FiBriefcase, FiUsers, FiFileText, FiClock, FiCreditCard, FiBarChart2, FiHelpCircle } from "react-icons/fi";
import CommandPalette from "./CommandPalette";
import Assistant from "./Assistant";
import Reminders from "./Reminders";
import Footer from "./Footer";
import { ToastProvider } from "./ui";

// [url, title, icon, Alt+key, area id (see lib/workspace-shared.js; null = always visible), group]
export const NAV = [
  ["/", "Übersicht", FiGrid, "1", null, "Arbeitsbereich"], ["/orders", "Aufträge", FiBriefcase, "2", "orders", "Arbeitsbereich"], ["/invoices", "Rechnungen", FiFileText, "3", "invoices", "Arbeitsbereich"],
  ["/customers", "Kunden", FiUsers, "4", "customers", "Arbeitsbereich"], ["/tasks", "Aufgaben", FiCheckSquare, "5", "tasks", "Arbeitsbereich"], ["/projects", "Projekte", FiFolder, "6", "projects", "Arbeitsbereich"],
  ["/inventory", "Inventar", FiPackage, "7", "inventory", "Arbeitsbereich"], ["/calendar", "Kalender", FiCalendar, "8", "calendar", "Arbeitsbereich"], ["/notes", "Notizen", FiEdit3, "9", "notes", "Arbeitsbereich"],
  ["/times", "Zeiterfassung", FiClock, "", "times", "Büro"], ["/expenses", "Ausgaben", FiCreditCard, "", "expenses", "Büro"], ["/reports", "Berichte", FiBarChart2, "", "reports", "Büro"],
  ["/admin", "Verwaltung", FiSliders, "0", null, "Büro"],
];

export { Brand } from "./Logo";
import { Brand } from "./Logo";

const ROLE_LABEL = { owner: "Inhaber", admin: "Admin", member: "Mitarbeiter", viewer: "Nur lesen" };
const SessionContext = createContext(null);
// Current user, firm and role, plus helpers for role-based UI.
export function useSession() {
  const s = useContext(SessionContext);
  const modules = s?.modules || [];
  return { ...s, canEdit: s?.role !== "viewer", isAdmin: s?.role === "owner" || s?.role === "admin", has: id => modules.includes(id), nav: NAV.filter(n => !n[4] || modules.includes(n[4])) };
}

export default function Shell({ children, session, modules, logo, logoWidth, logoStyle }) {
  const path = usePathname();
  const router = useRouter();
  const [palette, setPalette] = useState(false);
  const [menu, setMenu] = useState(false);
  const [help, setHelp] = useState(false);
  const nav = NAV.filter(n => !n[4] || modules.includes(n[4]));
  const tasksOn = modules.includes("tasks") && session.role !== "viewer";
  const [theme, setTheme] = useState("dark");
  const current = NAV.find(([url]) => (url === "/" ? path === "/" : path.startsWith(url)));

  useEffect(() => { setTheme(document.documentElement.dataset.theme || "dark"); }, []);
  useEffect(() => { setMenu(false); document.querySelector(".main")?.scrollTo({ top: 0, behavior: "instant" }); }, [path]);

  // Shortcuts: Strg/⌘+K search, Alt+digit switches areas, "n" creates a task, "?" opens the help.
  useEffect(() => {
    const onKey = e => {
      const typing = /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || e.target.isContentEditable;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette(p => !p); }
      else if (e.altKey && /^[0-9]$/.test(e.key)) { e.preventDefault(); const target = NAV.find(n => n[3] === e.key && (!n[4] || modules.includes(n[4]))); if (target) router.push(target[0]); }
      else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "n" && tasksOn) router.push("/tasks?new=1");
      else if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && e.key === "?") setHelp(h => !h);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, tasksOn, modules]);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem("theme", next); } catch {}
  };

  const logout = async () => {
    await import("@/lib/push-client").then(m => m.disablePush()).catch(() => {});
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.location.href = "/login";
  };
  const initials = session.user.name.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();

  return (
    <SessionContext.Provider value={{ ...session, modules }}>
    <ToastProvider>
      <div className="app">
        <aside className="sidebar" data-open={menu}>
          {logo ? <FirmLogo {...{ logo, logoWidth, logoStyle }} alt={session.org.name} /> : <Brand />}
          <nav className="nav" aria-label="Bereiche">
            {nav.map(([url, title, Icon, key, , group], i) => {
              const active = current?.[0] === url;
              return (
                <Fragment key={url}>
                  {group !== nav[i - 1]?.[5] && <div className="nav__label">{group}</div>}
                  <Link href={url} aria-current={active ? "page" : undefined}>
                    {active && <motion.span layoutId="nav-pill" className="nav__pill" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                    <Icon /><span>{title}</span>{key && <kbd>Alt {key}</kbd>}
                  </Link>
                </Fragment>
              );
            })}
          </nav>
          <div className="sidebar__foot">
            {tasksOn && <Link className="btn" href="/tasks?new=1"><FiPlus /> Neue Aufgabe</Link>}
            <div className="account">
              <span className="avatar" aria-hidden="true">{initials}</span>
              <span className="account__text"><b>{session.user.name}</b><small>{session.org.name} · {ROLE_LABEL[session.role]}</small></span>
              <button className="icon-btn" onClick={logout} aria-label="Abmelden" title="Abmelden"><FiLogOut /></button>
            </div>
          </div>
        </aside>
        {menu && <div className="overlay" style={{ zIndex: 19 }} onClick={() => setMenu(false)} />}
        <div className="main">
          <header className="topbar">
            <button className="icon-btn menu-btn" onClick={() => setMenu(true)} aria-label="Menü öffnen"><FiMenu /></button>
            <div className="crumb">{session.org.name} &nbsp;/&nbsp; <b>{current?.[1] || "Seite"}</b></div>
            <div className="topbar__actions">
              <button className="search-btn" onClick={() => setPalette(true)} aria-label="Suchen"><FiSearch /> <span>Suchen oder springen …</span> <kbd>Strg K</kbd></button>
              <Reminders />
              <button className="help-btn" onClick={() => setHelp(h => !h)} aria-expanded={help} aria-label="Hilfe öffnen"><FiHelpCircle /> <span>Hilfe</span></button>
              <button className="icon-btn" onClick={toggleTheme} aria-label={theme === "dark" ? "Helles Design" : "Dunkles Design"}>{theme === "dark" ? <FiSun /> : <FiMoon />}</button>
            </div>
          </header>
          <motion.main key={path} className="content"
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>
            {children}
          </motion.main>
          <Footer />
        </div>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} toggleTheme={toggleTheme} openHelp={() => setHelp(true)} />
      <Assistant open={help} onClose={() => setHelp(false)} />
    </ToastProvider>
    </SessionContext.Provider>
  );
}
