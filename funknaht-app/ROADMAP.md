# Treeplan · Nahtbord (entwickelt von FUNKNAHT)

Ziel: Vom MVP zum Portal, das kleine und mittlere Betriebe jeder Branche täglich brauchen und für das sie zahlen.
Legende: ✅ erledigt · 🔨 in Arbeit · ⬜ offen · ❓ Entscheidung nötig

```
Nahtbord
│
├── 1  FUNDAMENT  (Pflicht vor dem ersten zahlenden Kunden)
│   ├── 1.1 Zugang & Sicherheit
│   │   ├── ✅ Konten mit E-Mail + Passwort (scrypt-Hash, Rate-Limit beim Login)
│   │   ├── ✅ Sitzungen per HttpOnly-Cookie, Abmelden, Ablauf nach 30 Tagen
│   │   ├── ✅ Schutz aller Seiten und API-Routen, Herkunftsprüfung gegen CSRF
│   │   ├── ⬜ Passwort vergessen (braucht E-Mail-Versand → 2.1)
│   │   └── ⬜ Zwei-Faktor-Anmeldung (TOTP-App)
│   ├── 1.2 Mandanten & Rollen
│   │   ├── ✅ Jede Firma hat eine eigene Datenbankdatei (data/tenants/<firma>.sqlite), zentral nur Konten & Sitzungen
│   │   ├── ✅ Rollen: Inhaber · Admin · Mitarbeiter · Nur lesen
│   │   ├── ✅ Team-Verwaltung: Mitglieder anlegen, Rolle ändern, entfernen
│   │   └── ⬜ Einladung per E-Mail-Link (→ 2.1)
│   ├── 1.3 Daten & Betrieb
│   │   ├── ✅ Änderungsprotokoll: wer hat wann was geändert
│   │   ├── ✅ Backup aller Firmen oder einer einzelnen Firma, mit Integritätsprüfung
│   │   ├── ❓ Umzug auf PostgreSQL (Anbieter wählen: z. B. Hetzner, IONOS, Neon EU)
│   │   ├── ⬜ Hosting in Deutschland, Monitoring, Fehler-Tracking
│   │   └── ✅ Datenexport der ganzen Firma (JSON) · ✅ Firma endgültig löschen
│   ├── 1.4 Qualität
│   │   ├── ✅ Automatisierte API-Tests (34 Fälle) (Login, Rechte, Mandantentrennung, Rechnungen, Zeiten, Hilfe)
│   │   ├── ⬜ CI: Tests bei jeder Änderung (GitHub Actions)
│   │   └── ⬜ Externer Sicherheitstest vor Marktstart
│   └── 1.5 Recht
│       ├── ⬜ AV-Vertrag, Datenschutzerklärung, Impressum, AGB
│       └── ⬜ Barrierefreiheit nach BFSG prüfen
│
├── 2  BINDUNG  (Leute öffnen es jeden Tag)
│   ├── 2.1 ⬜ Benachrichtigungen: E-Mail, Push, @Erwähnungen, Tagesübersicht
│   ├── 2.2 ✅ Zuständige aus der Teamliste · ⬜ mehrere Zuständige
│   ├── 2.3 ⬜ Dateianhänge an Aufgaben, Projekten, Notizen
│   ├── 2.4 ⬜ Live-Aktualisierung bei mehreren Nutzern
│   ├── 2.5 ✅ Kalender-Abo (iCal) für Outlook / Google / Apple · ⬜ Zwei-Wege-Abgleich
│   ├── 2.6 ✅ Installierbar (Web-App-Manifest) · ⬜ Offline-Modus
│   ├── 2.10 ✅ Kalender mit Woche/Tag/Liste, Serien, Teilnehmern, Erinnerungen · ✅ Wecker · ✅ Web Push bei geschlossenem Browser · ⬜ Push für neue Aufgaben, Zuweisungen, Zahlungseingänge
│   ├── 2.7 ✅ Für jede Branche: Branchenwahl beim Start, Bereiche ein- und ausblendbar (Daten bleiben erhalten)
│   ├── 2.8 ✅ Erste-Schritte-Liste auf der Übersicht
│   └── 2.9 ✅ Hilfe in jeder Seite: eingebaute Anleitung, optional KI-Assistent
│       ├── ✅ Jeder OpenAI-kompatible Dienst (kostenlos: Ollama auf dem eigenen Server; Kontingente bei Groq, OpenRouter, Gemini)
│       ├── ✅ Externe Anbieter erhalten nur Frage + Anleitung, keine Kunden- oder Rechnungsdaten
│       └── ⬜ KI führt Aktionen aus (Auftrag anlegen, Rechnung vorbereiten) – erst mit Bestätigung durch die Person
│
├── 3  ABGRENZUNG  (Grund, es statt Asana / Monday zu kaufen)
│   ├── 3.1 ✅ Kunden & Aufträge: Kundenkartei, Pipeline Anfrage → Abgerechnet, Positionen mit MwSt., Angebot & Auftragsbestätigung drucken
│   ├── 3.2 ⬜ Online-Terminbuchung für Endkunden → erzeugt Auftrag + Aufgaben
│   ├── 3.3 ✅ Material aus dem Inventar auf Aufträge buchen (mit Rückbuchung)
│   ├── 3.4 ✅ Rechnungen nach § 14 UStG: lückenlose Nummer, unveränderbar (GoBD) mit Prüfsumme, Storno, Zahlungen, § 19, § 35a, § 14b
│   │   └── ✅ E-Rechnung XRechnung 3.0 (CII) · ⬜ Prüfung mit KoSIT-Validator · ⬜ ZUGFeRD-PDF · ⬜ Mahnwesen
│   ├── 3.5 ⬜ DATEV-Export (Buchungsstapel) · ⬜ Anbindung lexoffice / sevDesk
│   ├── 3.6 ⬜ Vorlagen, wiederkehrende Aufgaben, einfache Automationen
│   ├── 3.7 ✅ Zeiterfassung: Kommen/Gehen, Nachtrag, Urlaub, Krankheit, CSV für die Lohnabrechnung · ⬜ Soll-Stunden und Überstundenkonto · ⬜ Urlaubsantrag mit Freigabe
│   ├── 3.8 ✅ Ausgaben mit Vorsteuer und Kategorien · ⬜ Belegfoto anhängen (→ 2.3)
│   ├── 3.9 ✅ Berichte: Umsatz, Zahlungseingang, Ausgaben, Ergebnis, Kunden, Umsatzsteuer-Orientierung
│   ├── 3.11 ✅ Auswahl und Sammelaktionen in Listen · ✅ Stundenzettel, Bestellliste, Kundenblatt, Sammel-PDF als Druckansicht
│   ├── 3.12 ✅ Kundenakte · ✅ Notizen mit Kunde/Auftrag, Vorlagen, Tabellen, Bildern · ✅ formatierte Auftrags- und Aufgabenbeschreibung
│   └── 3.10 ⬜ Eigene Felder je Bereich (z. B. Kennzeichen, Vertragsnummer) · ⬜ Leistungskatalog mit Preisen · ⬜ Lieferanten
│
└── 4  GROSSKUNDEN
    ├── 4.1 ⬜ Firmen-Login (SSO: Microsoft Entra, Google Workspace)
    ├── 4.2 ⬜ Feinere Rechte je Projekt, Gastzugänge für Kunden
    ├── 4.3 ⬜ Öffentliche API mit Schlüsseln, Webhooks
    ├── 4.4 ⬜ Gantt-Ansicht, Auslastung
    └── 4.5 ⬜ Verfügbarkeitszusage (SLA), ISO-27001-Vorbereitung
```

## Geschäft (parallel)

```
├── Preise: Kostenlos (1 Person) · Team ab 79 € / Monat · Betrieb mit Buchung & Rechnung
├── 3–5 Pilotbetriebe im Kreis Plön / Ostholstein, Feedback alle 2 Wochen
├── Einrichtung vor Ort als Zusatzleistung (Stärke von FUNKNAHT)
└── Hilfe-Seiten, Video-Einführung, Support-Kontakt
```
