# Nahtbord – Alles an Bord.

Aufgaben, Projekte, Lager, Notizen und Termine für Betriebe – entwickelt von FUNKNAHT ([hexel-pi.vercel.app](https://hexel-pi.vercel.app/)). Eigene Marke, FUNKNAHT-Farben.
Frontend und Backend laufen zusammen – kein separater Express-Server und keine MongoDB mehr nötig.

## Start (Windows, Node.js ab 22.13)

```powershell
cd funknaht-app
npm install
copy .env.example .env.local   # optional anpassen
npm run dev                    # http://localhost:3000
```

Beim ersten Aufruf auf **„Firma kostenlos anlegen“** gehen. Die erste registrierte Firma übernimmt automatisch alle vorhandenen Daten (z. B. aus dem Feldwerk-Import). Danach unter **Verwaltung → Team** Mitarbeiter mit Rolle anlegen.

Produktion: `npm run build` und danach `npm start` (nur hinter HTTPS betreiben – Sitzungs-Cookies sind dann `Secure`).

| Befehl | Zweck |
| --- | --- |
| `npm test` | Baut in `.next-test` und prüft per HTTP: Login, Rollen, Mandantentrennung, CSRF, Lager, Sperre |
| `npm run backup` | Sicherung aller Firmen nach `data/backups/<zeit>/`, behält die letzten 14 – täglich per Aufgabenplanung ausführen |
| `npm run backup -- --org <id>` | Sicherung nur einer Firma (ID steht unter Verwaltung → Firma & Datenbank bzw. als Dateiname) |
| `npm run seed` | Demo-Daten für die erste Firma |

## Rollen

| Rolle | Darf |
| --- | --- |
| Inhaber | alles, Admins ernennen; kann nicht entfernt werden |
| Admin | Team verwalten (außer Admins), Mitteilung, Protokoll, Gesamtexport |
| Mitarbeiter | alle Inhalte anlegen, bearbeiten, löschen |
| Nur lesen | alles sehen, nichts ändern |

### Alte Feldwerk-Daten übernehmen

```powershell
npm run import:feldwerk                      # liest ../backend/data/feldwerk.sqlite
npm run import:feldwerk -- D:\pfad\datei.sqlite
```

Vorhandene Einträge werden nicht überschrieben. Alternativ `SQLITE_PATH` in `.env.local` direkt auf die alte Datei setzen – das Speicherformat ist kompatibel.

## Kunden & Aufträge

- **Kunden** (`/customers`): Kundenkartei mit Nummer (K-1001 …), Firma oder Privat, Anschrift, Kontakt per Klick, Auftragsvolumen und Verlauf.
- **Aufträge** (`/orders`): Pipeline Anfrage → Angebot → Beauftragt → In Arbeit → Erledigt → Abgerechnet (Karten ziehen), fortlaufende Nummern pro Jahr (A-2026-0001 …).
- **Positionen** mit Menge, Einheit, Einzelpreis und MwSt. 19 / 7 / 0 %; Netto, MwSt. und Brutto rechnet der Server.
- **Material aus dem Lager** wird beim Buchen sofort vom Bestand abgezogen; Entfernen oder Löschen des Auftrags bucht es zurück. Lager und Auftrag ändern sich immer gemeinsam.
- **Aufgaben** lassen sich einem Auftrag zuordnen; die erfasste Arbeitszeit kann als Position übernommen werden.
- **Angebot und Auftragsbestätigung** als A4-Druckansicht (`/print/order/<id>`), im Browser als PDF speicherbar. Briefkopf und Bankdaten unter *Verwaltung → Firmendaten*.

## Rechnungen (`/invoices`)

- **Entwurf → Stellen:** Entwürfe sind frei änderbar und löschbar. Erst beim Stellen (nur Inhaber/Admin) gibt es die nächste lückenlose Nummer (R-2026-0001 …), Rechnungsdatum und Fälligkeit.
- **Pflichtangaben (§ 14 Abs. 4 UStG)** werden vor dem Stellen geprüft: Anschrift und Steuernummer/USt-IdNr. der Firma, vollständige Kundenanschrift, Leistungsdatum, Positionen.
- **Unveränderbar (GoBD):** Beim Stellen werden Firmendaten, Kundenanschrift und Positionen eingefroren und mit SHA-256 versiegelt; die Druckansicht zeigt, ob die Prüfsumme stimmt. Änderungen und Löschen sind gesperrt – Korrektur nur per **Stornorechnung** (eigene Nummer, negative Beträge, Verweis auf das Original).
- **Zahlungen:** Teil- und Vollzahlungen, Status offen / teilbezahlt / überfällig / bezahlt.
- **Kleinunternehmer (§ 19 UStG)** unter Verwaltung → Firmendaten: Rechnungen ohne Umsatzsteuer mit Pflichthinweis.
- **Privatkunden:** Arbeitskostenanteil nach § 35a EStG und Hinweis auf die 2-jährige Aufbewahrungspflicht (§ 14b UStG).
- **E-Rechnung:** XRechnung 3.0 (UN/CEFACT CII) als XML. Vor dem ersten Versand an Behörden mit dem kostenlosen [KoSIT-Validator](https://github.com/itplr-kosit/validator) prüfen. Benötigt IBAN, Telefon und E-Mail in den Firmendaten sowie die E-Mail des Kunden.
- Kunden und Aufträge mit Rechnungen können nicht gelöscht werden (Aufbewahrung 10 Jahre, § 147 AO).

> Hinweis: Nahtbord ersetzt keine steuerliche Beratung. Vor dem produktiven Einsatz Rechnungslayout und Abläufe mit der Steuerberatung abstimmen.

## Für jede Branche: Arbeitsbereich

- Beim ersten Start fragt die Übersicht nach der **Branche** (Handwerk, Dienstleistung, Handel, Praxis/Studio, Verein/Team). Danach zeigt das Menü nur die passenden Bereiche.
- Unter **Verwaltung → Arbeitsbereich** lässt sich jeder Bereich einzeln ein- und ausblenden. Ausgeblendete Bereiche behalten ihre Daten.
- Die Liste **Erste Schritte** auf der Übersicht zeigt, was noch fehlt (Firmendaten, erster Kunde, erste Rechnung, Kollegen einladen).
- Ein neuer Bereich braucht eine Zeile in `lib/workspace-shared.js`, einen Eintrag in `NAV` (`components/Shell.jsx`) und eine Seite unter `app/(app)/`.

## Zeiterfassung, Ausgaben, Berichte

- **Zeiterfassung (`/times`):** „Kommen“ und „Gehen“ oder Nachtrag mit Beginn, Ende und Pause; Urlaub, Krankheit und Feiertage als ganze Tage. Mitarbeiter sehen nur ihre eigenen Zeiten, Admins alle. CSV-Export für die Lohnabrechnung.
- **Ausgaben (`/expenses`):** Lieferant, Bruttobetrag, Steuersatz, Kategorie, bezahlt/offen. Netto und Vorsteuer rechnet der Server.
- **Berichte (`/reports`):** je Monat Rechnungsumsatz, Zahlungseingang, Ausgaben und Ergebnis; dazu offene Rechnungen, umsatzstärkste Kunden, Ausgaben je Kategorie, Arbeitszeit. Die Umsatzsteuer-Übersicht ist eine Orientierung, keine Voranmeldung.

## Hilfe und KI-Assistent

Der Knopf **Hilfe** (oder die Taste `?`) öffnet auf jeder Seite ein Fenster, das Fragen in eigenen Worten beantwortet.

- **Ohne Einrichtung** antwortet die eingebaute Anleitung (`lib/help.js`). Das kostet nichts und sendet nichts nach außen.
- **Mit KI:** In `.env.local` `AI_BASE_URL` und `AI_MODEL` setzen (Beispiele in `.env.example`). Jeder Dienst mit OpenAI-kompatibler Schnittstelle funktioniert.
  - Kostenlos und ohne Datenabfluss: [Ollama](https://ollama.com) auf dem eigenen Server (`AI_BASE_URL=http://127.0.0.1:11434/v1`).
  - Kostenlose Kontingente mit Tageslimit gibt es u. a. bei Groq, OpenRouter (`:free`-Modelle) und Google Gemini. Die Grenzen ändern sich oft; bei kostenlosen Tarifen können Anbieter Eingaben zum Training verwenden.
- **Datenschutz:** Ein externer Anbieter erhält nur die Frage und die Anleitung. Summen der Firma (z. B. Anzahl offener Rechnungen, nie Namen) gehen nur an ein lokales Modell oder wenn `AI_SHARE_FIGURES=1` gesetzt ist. Jede Firma kann die KI unter Verwaltung → Arbeitsbereich abschalten.
- An die KI gehen nur die Themen der Anleitung, die zur Frage passen (rund 1.000 Tokens je Frage). So reicht ein kostenloses Kontingent für deutlich mehr Fragen.
- Ist die KI nicht erreichbar oder das Kontingent verbraucht, antwortet automatisch die Anleitung.
- Die KI erklärt nur; sie ändert keine Daten.

## Datenhaltung: eine Datenbank pro Firma

```
data/funknaht.sqlite          Steuer-Datenbank: Firmen, Konten, Rollen, Sitzungen – keine Geschäftsdaten
data/tenants/<firma>.sqlite   je Firma eine eigene Datei: Kunden, Aufträge, Rechnungen, Aufgaben, Lager, Zeiten, Ausgaben, Protokoll …
```

- Eine Firma lässt sich einzeln sichern, wiederherstellen (App stoppen, Datei zurückkopieren), exportieren, auf einen eigenen Server umziehen oder löschen.
- Daten aus älteren Versionen (alles in einer Datei) wandern automatisch in die Firmen-Datei, sobald die Firma das nächste Mal genutzt wird.
- „Firma löschen“ (nur Inhaber, unter Verwaltung) entfernt die Datei und alle Zugänge endgültig.

## Aufbau

| Bereich | Ort |
| --- | --- |
| Seiten (App Router) | `app/*/page.jsx` |
| Oberfläche | `components/` |
| REST-API | `app/api/` – `[resource]` für customers, orders, invoices, tasks, projects, products, notes, events, times, expenses; dazu `stock`, `overview`, `search`, `export`, `settings`, `reports`, `assistant` |
| Datenbank & Validierung | `lib/db.js`, `lib/resources.js` (SQLite über `node:sqlite`) |
| Design-Tokens | `app/globals.css` |

## Neu gegenüber der alten Version

- **Neues Design** im FUNKNAHT-Stil (Petrol, Messing, Bricolage Grotesque), helles und dunkles Design.
- **Glas-Optik:** halbtransparente, weichgezeichnete Flächen über einem Farbhintergrund, schwebendes Menü und schwebende Kopfleiste. Der ganze Stil steht als ein Block am Ende von `app/globals.css` („Glass theme“) und lässt sich dort anpassen oder entfernen.
- **Notizen wie in einer Textverarbeitung:** Schriftart, Größe, Farbe, Textmarker, Listen, Checklisten, Ausrichtung und Links (`components/RichEditor.jsx`). Gespeichert wird ein geprüfter Dokumentbaum, kein HTML (`lib/richtext.js`).
- **Auswahl und Sammelaktionen:** In Rechnungen (PDF mehrerer Rechnungen, als bezahlt, CSV), Ausgaben (als bezahlt, CSV für die Steuerberatung, löschen), Inventar (Bestellliste, löschen) und Aufgaben (Status, Zuständig, löschen).
- **Weitere PDF-Ansichten:** Stundenzettel je Person und Monat (`/print/timesheet`), Bestellliste (`/print/reorder`), Kundenblatt (`/print/customer/[id]`), mehrere Rechnungen (`/print/invoices?ids=…`).
- **Kalender:** Monat, Woche, Tag und Liste; Serientermine (täglich, wöchentlich an Wochentagen, monatlich, jährlich, mit Ende), einzelne Termine einer Serie absagen, ganztägige Termine, Teilnehmer, Kunde/Auftrag, bis zu 5 Erinnerungen, Verschieben per Ziehen. Das Kalender-Abo überträgt Serien, Ausnahmen und Erinnerungen (VALARM) in deutscher Zeitzone.
- **Erinnerungen und Wecker:** Glocke oben rechts mit den nächsten Erinnerungen, Ton und Hinweis des Betriebssystems, Schlummern 5/10 Minuten. Persönliche Wecker (Uhrzeit, Wochentage oder Datum, drei Töne) sieht nur die eigene Person. Klingelt, solange Nahtbord in einem Tab geöffnet ist (`components/Reminders.jsx`, `lib/calendar-shared.js`).
- **Web Push:** Glocke → „Push auf diesem Gerät“. Der Server prüft jede Minute (`instrumentation.js` → `lib/push.js`), was fällig ist, und schickt Erinnerungen und Wecker verschlüsselt über den Push-Dienst des Browsers – auch bei geschlossenem Browser. Schlüssel werden beim ersten Start erzeugt (oder `VAPID_*` in `.env.local`). Nur bekannte Push-Dienste werden angesprochen. iPhone/iPad: nur als installierte Web-App (Zum Home-Bildschirm). Nahtbord muss dafür über HTTPS erreichbar sein.
- **Kundenakte:** links die Kundenliste, rechts Stammdaten, Kennzahlen, Aufträge, Rechnungen und verknüpfte Notizen.
- **Formatierter Text auch in Auftrag und Aufgabe;** die Auftragsbeschreibung erscheint formatiert im Angebot. Notizen können Tabellen und Bilder enthalten, mit Kunde und Auftrag verknüpft und aus Vorlagen angelegt werden.
- **Notizen-Ansicht:** links die Liste, rechts die Notiz als Dokument; umschaltbar auf Kacheln. Mit „Auswählen“ lassen sich mehrere Notizen anhaken und zusammen als PDF speichern (`/print/notes?ids=…`, Druckdialog → „Als PDF speichern“) oder löschen.
- **Motion-Grafik**: Funkwellen und eine „Naht“, die sich über den Startbereich zieht; Seitenübergänge, animierte Kennzahlen, Fortschrittsringe, Drag-Animationen.
- **FUNKNAHT-Logo** ganz unten im Footer mit Funkwellen-Animation.
- **Suche & Befehle** mit `Strg + K` über alle Bereiche, Tastenkürzel `Alt + 1…7` und `N`.
- **Kanban** mit vier Spalten (inkl. Prüfung), WIP-Limit, Board- und Listenansicht, Filter nach Projekt und Priorität.
- **Zeiterfassung** pro Aufgabe (Start/Stopp), Summe auf der Übersicht.
- **Kommentare und Teilaufgaben** an Aufgaben.
- **Projekte** mit Farbe, Deadline und automatischem Fortschritt.
- **Inventar** mit Mindestbestand je Artikel, Artikelnummer, Lagerwert, Buchungsverlauf und Nachbestell-Filter.
- **Notizen** jetzt in der Datenbank (vorher nur im Browser), mit Autosave, Markdown-Vorschau, Anheften und Farben.
- **Kalender** als Monatsansicht inkl. fälliger Aufgaben, Ort und Farbe je Termin.
- **Aktivitätsverlauf** und 14-Tage-Diagramm auf der Übersicht.
- **CSV-Export** (Excel-tauglich) für alle Bereiche.

## Sicherheit

- Passwörter mit scrypt gehasht, Sitzungen als zufällige Tokens (nur der Hash liegt in der Datenbank), HttpOnly-Cookie, 30 Tage gültig.
- Jede Datenbankabfrage ist auf die Firma der Sitzung beschränkt; fremde IDs liefern 404.
- Änderungen werden nur von der eigenen Herkunft angenommen (CSRF-Schutz) und je Rolle geprüft.
- Login-Sperre nach 8 Fehlversuchen pro E-Mail bzw. 40 pro IP in 15 Minuten.
- Passwortwechsel meldet alle anderen Geräte ab; entfernte Mitglieder verlieren sofort den Zugang.

Offen vor dem Marktstart: siehe [ROADMAP.md](ROADMAP.md) (u. a. Passwort-vergessen per E-Mail, 2FA, PostgreSQL, externer Sicherheitstest).
