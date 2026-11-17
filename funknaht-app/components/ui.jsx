"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, animate, useInView } from "framer-motion";
import { FiX, FiCheckCircle, FiAlertTriangle, FiInbox, FiCheck, FiCheckSquare } from "react-icons/fi";

export const spring = { type: "spring", stiffness: 380, damping: 32 };
export const rise = {
  hidden: { opacity: 0, y: 14 },
  show: i => ({ opacity: 1, y: 0, transition: { delay: (i || 0) * 0.05, duration: 0.5, ease: [0.16, 1, 0.3, 1] } }),
};

/* ---------- Toasts ---------- */
const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((text, kind = "ok") => {
    const id = Math.random();
    setToasts(t => [...t, { id, text, kind }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div key={t.id} className={`toast toast--${t.kind}`} layout
              initial={{ opacity: 0, x: 40, scale: 0.95 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} transition={spring}>
              {t.kind === "error" ? <FiAlertTriangle /> : <FiCheckCircle />} {t.text}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

/* ---------- Modal ---------- */
export function Modal({ open, onClose, title, children, footer, wide }) {
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div className={`modal ${wide ? "modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}
            initial={{ opacity: 0, y: 24, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }} transition={spring}>
            <div className="modal__head"><h2>{title}</h2><button className="icon-btn" onClick={onClose} aria-label="Schließen"><FiX /></button></div>
            <div className="modal__body">{children}</div>
            {footer && <div className="modal__foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function Field({ label, children }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

export function Swatches({ value, onChange, allowNone }) {
  const colors = ["fjord", "brass", "moss", "rust", "slate"];
  return (
    <div className="swatches" role="group" aria-label="Farbe">
      {allowNone && <button type="button" className="swatch" style={{ background: "var(--stone)" }} aria-pressed={!value} onClick={() => onChange("")} aria-label="Keine Farbe" />}
      {colors.map(c => <button type="button" key={c} className={`swatch c-${c}`} aria-pressed={value === c} onClick={() => onChange(c)} aria-label={c} />)}
    </div>
  );
}

export function PageHead({ eyebrow, title, text, children }) {
  return (
    <motion.div className="page-head" initial="hidden" animate="show">
      <div>
        <motion.div className="eyebrow" variants={rise} custom={0}>{eyebrow}</motion.div>
        <motion.h1 variants={rise} custom={1}>{title}</motion.h1>
        {text && <motion.p variants={rise} custom={2}>{text}</motion.p>}
      </div>
      {children && <motion.div className="row" variants={rise} custom={2}>{children}</motion.div>}
    </motion.div>
  );
}

export function Empty({ icon: Icon = FiInbox, children }) {
  return <motion.div className="empty" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}><Icon /><div>{children}</div></motion.div>;
}

export function Skeleton({ rows = 3, height = 64 }) {
  return <div className="stack">{Array.from({ length: rows }, (_, i) => <div key={i} className="skeleton" style={{ height }} />)}</div>;
}

// Counts up from 0 when it scrolls into view.
export function Counter({ value, format = v => Math.round(v).toLocaleString("de-DE") }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  useEffect(() => {
    if (!inView) return;
    // Users who prefer reduced motion see the final number right away.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { if (ref.current) ref.current.textContent = format(value || 0); return; }
    const controls = animate(0, value || 0, { duration: 1.1, ease: [0.16, 1, 0.3, 1], onUpdate: v => { if (ref.current) ref.current.textContent = format(v); } });
    return () => controls.stop();
  }, [inView, value, format]);
  return <span ref={ref}>{format(0)}</span>;
}

export function confirmDelete(what) {
  return window.confirm(`${what} wirklich löschen? Das lässt sich nicht rückgängig machen.`);
}

/* ---------- Selection of several rows (lists and tables) ---------- */
// sel.active switches the list into selection mode; rows then toggle instead of opening.
export function useSelection() {
  const [picked, setPicked] = useState(null);
  return {
    active: !!picked, count: picked?.size || 0, ids: [...(picked || [])],
    start: () => setPicked(new Set()), stop: () => setPicked(null),
    has: id => !!picked?.has(id),
    toggle: id => setPicked(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }),
    all: ids => setPicked(p => (p && p.size === ids.length && ids.every(id => p.has(id)) ? new Set() : new Set(ids))),
    keep: ids => setPicked(p => (p ? new Set([...p].filter(id => ids.includes(id))) : p)),
  };
}

// "Auswählen" button, or – while selecting – the count, all/none, the actions and "Fertig".
export function SelectBar({ sel, ids, children, label = "Auswählen" }) {
  if (!sel.active) return <button className="btn btn--ghost btn--sm" disabled={!ids.length} onClick={sel.start}><FiCheckSquare /> {label}</button>;
  const allOn = ids.length > 0 && ids.every(id => sel.has(id));
  return (
    <div className="selbar" role="group" aria-label="Auswahl">
      <b>{sel.count} ausgewählt</b>
      <button className="btn btn--ghost btn--sm" onClick={() => sel.all(ids)}>{allOn ? "Keine" : "Alle"}</button>
      {children}
      <button className="btn btn--ghost btn--sm" onClick={sel.stop}><FiX /> Fertig</button>
    </div>
  );
}

// Checkbox look used in rows and cards while selecting.
export function Pick({ on }) {
  return <span className="pick" data-on={on ? "true" : "false"} aria-hidden="true"><FiCheck /></span>;
}

// Runs one request per id after another; returns how many succeeded and the first error.
export async function forEach(ids, fn) {
  let done = 0;
  for (const id of ids) {
    try { await fn(id); done++; } catch (error) { return { done, error }; }
  }
  return { done, error: null };
}

// Opens a print view in a new tab; there "Als PDF speichern" creates the file.
export const openPrint = url => window.open(url + (url.includes("?") ? "&" : "?") + "auto=1", "_blank");
