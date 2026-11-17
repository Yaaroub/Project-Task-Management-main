"use client";
import { motion } from "framer-motion";
import { NahtbordMark, Wordmark, TAGLINE } from "./Logo";

// Footer: the tool's own identity left, a small developer credit for FUNKNAHT (with link) at the very bottom right.
export default function Footer() {
  return (
    <footer className="footer">
      <motion.div className="footer__inner" initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}>
        <div className="footer__product">
          <NahtbordMark size={26} animate={false} />
          <Wordmark /> <span className="muted">· {TAGLINE}</span>
        </div>
        <a className="credit" href="https://hexel-pi.vercel.app/" target="_blank" rel="noopener noreferrer" aria-label="Entwickelt von FUNKNAHT – Website öffnen (neues Fenster)">
          <span className="credit__label">Entwickelt von</span>
          <img src="/funknaht-mark.png" alt="" width="22" height="22" />
          <span className="credit__name">FUNKNAHT</span>
        </a>
      </motion.div>
    </footer>
  );
}
