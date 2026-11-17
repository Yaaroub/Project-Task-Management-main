"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FiX, FiSend, FiHelpCircle, FiArrowRight, FiRotateCcw } from "react-icons/fi";
import { api } from "@/lib/client";

// Help panel beside the page: answers from the built-in manual, or from an AI model if one is connected.
export default function Assistant({ open, onClose }) {
  const path = usePathname();
  const [info, setInfo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const input = useRef(null);
  const end = useRef(null);

  useEffect(() => {
    if (!open) return;
    api("assistant?page=" + encodeURIComponent(path)).then(setInfo).catch(() => setInfo({ ai: false, suggestions: [] }));
    setTimeout(() => input.current?.focus(), 60);
  }, [open, path]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages, busy]);
  useEffect(() => {
    if (!open) return;
    const onKey = e => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const send = async question => {
    const q = (question ?? text).trim();
    if (!q || busy) return;
    const history = [...messages, { role: "user", content: q }];
    setMessages(history); setText(""); setBusy(true);
    try {
      const r = await api("assistant", { method: "POST", body: { page: path, messages: history.map(({ role, content }) => ({ role, content })) } });
      setMessages([...history, { role: "assistant", content: r.answer, links: r.links, source: r.source, notice: r.notice }]);
    } catch (err) {
      setMessages([...history, { role: "assistant", content: err.message, error: true }]);
    } finally { setBusy(false); setTimeout(() => input.current?.focus(), 30); }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.aside className="assist" role="dialog" aria-label="Hilfe" initial={{ x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 40, opacity: 0 }} transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}>
          <header className="assist__head">
            <FiHelpCircle />
            <div><b>Hilfe</b><small>{!info ? "…" : info.ai ? (info.local ? "KI-Assistent · läuft auf dem eigenen Server" : "KI-Assistent") : "Antworten aus der Anleitung"}</small></div>
            {messages.length > 0 && <button className="icon-btn" onClick={() => setMessages([])} aria-label="Neues Gespräch" title="Neues Gespräch"><FiRotateCcw /></button>}
            <button className="icon-btn" onClick={onClose} aria-label="Hilfe schließen"><FiX /></button>
          </header>

          <div className="assist__body" aria-live="polite">
            {!messages.length && (
              <div className="assist__intro">
                <p>Fragen Sie in Ihren eigenen Worten, zum Beispiel „Wie schreibe ich eine Rechnung?“</p>
                <div className="assist__chips">
                  {(info?.suggestions || []).map(s => <button key={s} onClick={() => send(s)}>{s}</button>)}
                </div>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`assist__msg assist__msg--${m.role}${m.error ? " assist__msg--error" : ""}`}>
                {m.notice && <small className="assist__note">{m.notice}</small>}
                <div>{m.content}</div>
                {m.links?.length > 0 && (
                  <div className="assist__links">
                    {m.links.map(l => l.topic
                      ? <button key={l.title} onClick={() => send(l.topic)}>{l.title}</button>
                      : <Link key={l.title} href={l.href}>{l.title} <FiArrowRight /></Link>)}
                  </div>
                )}
              </div>
            ))}
            {busy && <div className="assist__msg assist__msg--assistant assist__typing" aria-label="Antwort wird geschrieben"><i /><i /><i /></div>}
            <div ref={end} />
          </div>

          <form className="assist__form" onSubmit={e => { e.preventDefault(); send(); }}>
            <input ref={input} className="input" value={text} onChange={e => setText(e.target.value)} maxLength={2000} placeholder="Frage eingeben …" aria-label="Frage an die Hilfe" />
            <button className="btn" disabled={busy || !text.trim()} aria-label="Frage senden"><FiSend /></button>
          </form>
          {info?.ai && <small className="assist__foot">Die KI kann sich irren. Steuer- und Rechtsfragen bitte fachlich prüfen lassen.</small>}
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
