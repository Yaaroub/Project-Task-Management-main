"use client";
import { useEffect } from "react";
import { FiPrinter, FiArrowLeft } from "react-icons/fi";

// Toolbar above the printable document; hidden when printing.
export default function PrintBar({ title, auto = false }) {
  // auto: opened through a "PDF" button – the print dialog comes up by itself once the page is drawn.
  useEffect(() => {
    if (!auto) return;
    const t = setTimeout(() => window.print(), 500);
    return () => clearTimeout(t);
  }, [auto]);
  return (
    <div className="doc-bar">
      <button className="btn btn--ghost btn--sm" onClick={() => (window.history.length > 1 ? window.history.back() : window.close())}><FiArrowLeft /> Zurück</button>
      <span className="doc-bar__title">{title}</span>
      <span className="spacer" />
      <span className="muted" style={{ fontSize: 12 }}>Tipp: Im Druckdialog „Als PDF speichern“ wählen.</span>
      <button className="btn btn--sm" onClick={() => window.print()}><FiPrinter /> Drucken / PDF</button>
    </div>
  );
}
