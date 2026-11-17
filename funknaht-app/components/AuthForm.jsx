"use client";
import Link from "next/link";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FiArrowRight, FiLock } from "react-icons/fi";
import HeroMotion from "./HeroMotion";
import Footer from "./Footer";
import { Brand } from "./Shell";
import { api } from "@/lib/client";
import { Field, rise } from "./ui";

export default function AuthForm({ mode }) {
  const register = mode === "register";
  const [form, setForm] = useState({ name: "", company: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = key => e => setForm({ ...form, [key]: e.target.value });

  const submit = async e => {
    e.preventDefault();
    setBusy(true); setError("");
    try {
      await api(register ? "auth/register" : "auth/login", { method: "POST", body: register ? form : { email: form.email, password: form.password } });
      window.location.href = "/";
    } catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div className="auth">
      <main className="auth__main">
        <section className="auth__visual">
          <HeroMotion compact />
          <Brand />
          <motion.div initial="hidden" animate="show">
            <motion.div className="eyebrow" variants={rise} custom={0} style={{ color: "var(--champagne)" }}>Nahtbord · Aufgaben, Lager, Termine</motion.div>
            <motion.h1 variants={rise} custom={1}>Alles an <em>Bord.</em></motion.h1>
            <motion.p variants={rise} custom={2}>Aufgaben, Projekte, Lager, Notizen und Termine für Ihr ganzes Team – sicher getrennt pro Firma.</motion.p>
          </motion.div>
        </section>
        <section className="auth__panel">
          <motion.div className="auth__card" initial="hidden" animate="show">
            <motion.div className="eyebrow" variants={rise} custom={0}><FiLock /> {register ? "Neue Firma anlegen" : "Anmelden"}</motion.div>
            <motion.h2 variants={rise} custom={1}>{register ? "Kostenlos starten" : "Willkommen zurück"}</motion.h2>
            <motion.p className="muted" variants={rise} custom={2} style={{ margin: 0 }}>
              {register ? "Sie werden Inhaber des Arbeitsbereichs und können danach Ihr Team einladen." : "Melden Sie sich mit Ihrer E-Mail-Adresse an."}
            </motion.p>
            <motion.form className="stack" onSubmit={submit} variants={rise} custom={3}>
              <AnimatePresence>{error && <motion.div className="auth__error" role="alert" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{error}</motion.div>}</AnimatePresence>
              {register && <Field label="Ihr Name"><input className="input" autoComplete="name" required value={form.name} onChange={set("name")} /></Field>}
              {register && <Field label="Firma"><input className="input" autoComplete="organization" required value={form.company} onChange={set("company")} placeholder="z. B. Heizung & Sanitär Petersen" /></Field>}
              <Field label="E-Mail"><input className="input" type="email" autoComplete="email" required value={form.email} onChange={set("email")} /></Field>
              <Field label={register ? "Passwort (mindestens 10 Zeichen)" : "Passwort"}>
                <input className="input" type="password" autoComplete={register ? "new-password" : "current-password"} required minLength={register ? 10 : undefined} value={form.password} onChange={set("password")} />
              </Field>
              <button className="btn" disabled={busy}>{busy ? "Bitte warten …" : register ? "Konto anlegen" : "Anmelden"} <FiArrowRight /></button>
            </motion.form>
            <motion.p className="auth__switch" variants={rise} custom={4}>
              {register ? <>Schon ein Konto? <Link href="/login">Anmelden</Link></> : <>Neu hier? <Link href="/register">Firma kostenlos anlegen</Link></>}
            </motion.p>
          </motion.div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
