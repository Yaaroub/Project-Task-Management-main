import "server-only";

// Built-in manual. It answers questions without any AI and is also the knowledge the AI help is given.
// module: the area a topic belongs to (hidden when the firm has switched that area off). words: search terms.
export const TOPICS = [
  { id: "start", module: null, href: "/", title: "Erste Schritte",
    words: "anfang anfangen start starten einrichten einrichtung loslegen erste schritte neu beginnen",
    text: "1. Unter Verwaltung die Branche wählen – so sehen Sie nur die Bereiche, die Sie brauchen.\n2. Firmendaten eintragen (Adresse, Steuernummer).\n3. Den ersten Kunden anlegen.\n4. Einen Auftrag oder ein Angebot anlegen und daraus die Rechnung erstellen.\nDie Liste „Erste Schritte“ auf der Übersicht zeigt, was noch offen ist." },
  { id: "customers", module: "customers", href: "/customers", title: "Kunden anlegen und pflegen",
    words: "kunde kunden kontakt adresse ansprechpartner kundennummer kartei firma privat",
    text: "Kunden → „Neuer Kunde“. Name genügt, die Kundennummer (K-1001 …) vergibt Nahtbord selbst. Für Rechnungen braucht der Kunde Straße, PLZ und Ort. Links steht die Kundenliste, rechts die Kundenakte: Stammdaten, Aufträge, Rechnungen, Notizen, Umsatz und offene Beträge. Aus der Akte legen Sie direkt Auftrag, Rechnung oder Notiz an; „Kundenblatt“ öffnet alles als PDF. Kunden mit Rechnungen lassen sich nicht löschen, weil Rechnungen 10 Jahre aufbewahrt werden müssen." },
  { id: "orders", module: "orders", href: "/orders", title: "Aufträge und Angebote",
    words: "auftrag aufträge angebot angebote anfrage pipeline position positionen leistung auftragsbestätigung status",
    text: "Aufträge → „Neuer Auftrag“: Kunde wählen, Bezeichnung eintragen, Positionen hinzufügen (Leistung oder Material). Der Status läuft von Anfrage über Angebot, Beauftragt, In Arbeit und Erledigt bis Abgerechnet; in der Pipeline ziehen Sie den Auftrag einfach in die nächste Spalte. Im Auftrag drucken Sie über „Angebot“ oder „Auftragsbestätigung“ das Dokument oder speichern es als PDF." },
  { id: "material", module: "inventory", href: "/orders", title: "Material aus dem Lager auf einen Auftrag buchen",
    words: "material lager buchen verbrauch entnahme artikel auftrag rückbuchen zurück",
    text: "Im Auftrag „Material aus Lager“ wählen, Artikel und Menge angeben. Der Bestand sinkt sofort und die Position steht mit Preis im Auftrag. Wird die Position entfernt oder der Auftrag gelöscht, bucht Nahtbord das Material zurück." },
  { id: "invoice-create", module: "invoices", href: "/invoices", title: "Rechnung schreiben und stellen",
    words: "rechnung rechnungen schreiben erstellen stellen entwurf rechnungsnummer abrechnen faktura",
    text: "Am schnellsten: im Auftrag auf „Rechnung erstellen“ – Kunde und Positionen werden übernommen. Oder Rechnungen → „Neue Rechnung“. Solange die Rechnung ein Entwurf ist, können Sie alles ändern. Mit „Rechnung stellen“ (nur Inhaber und Admins) bekommt sie ihre fortlaufende Nummer und ist danach unveränderbar. Dafür nötig: vollständige Firmendaten, Kundenadresse, Leistungsdatum und mindestens eine Position." },
  { id: "invoice-fix", module: "invoices", href: "/invoices", title: "Rechnung korrigieren oder stornieren",
    words: "storno stornieren korrigieren korrektur fehler falsch ändern löschen rechnung gutschrift unveränderbar",
    text: "Eine gestellte Rechnung darf nicht geändert oder gelöscht werden (GoBD). Bei einem Fehler: Rechnung öffnen → „Stornieren“. Nahtbord erzeugt eine Stornorechnung; sie bekommt die nächste Nummer aus derselben Reihe wie alle Rechnungen. Danach schreiben Sie über Rechnungen → „Neue Rechnung“ eine neue, richtige Rechnung. Sind schon Zahlungen erfasst, müssen diese zuerst entfernt werden: in der geöffneten Rechnung im Abschnitt „Zahlungen“ über das Papierkorb-Symbol (nur Admins). Stornieren dürfen nur Inhaber und Admins." },
  { id: "payments", module: "invoices", href: "/invoices", title: "Zahlungen erfassen und offene Posten",
    words: "zahlung zahlungen bezahlt offen offene posten überfällig teilzahlung zahlungseingang mahnung fällig",
    text: "Rechnung öffnen und unter Zahlungen Betrag und Datum eintragen (Admins). Bei Teilzahlung zeigt die Rechnung „Teilbezahlt“ und den Restbetrag. Nach dem Fälligkeitsdatum wird sie als „Überfällig“ markiert. Mahnungen schreibt oder verschickt Nahtbord nicht. Die Übersicht und der Bereich Berichte zeigen die Summe aller offenen Rechnungen." },
  { id: "einvoice", module: "invoices", href: "/invoices", title: "E-Rechnung (XRechnung) und PDF",
    words: "e-rechnung erechnung xrechnung xml zugferd pdf drucken elektronisch behörde leitweg",
    text: "Gestellte Rechnung öffnen → „E-Rechnung“ lädt die XRechnung als XML-Datei. Dafür brauchen die Firmendaten IBAN, Telefon und E-Mail und der Kunde eine E-Mail-Adresse. Für ein PDF die Druckansicht öffnen und „Als PDF speichern“ wählen. Nahtbord verschickt selbst keine E-Mails: Speichern Sie PDF oder XML und senden Sie die Datei mit Ihrem eigenen E-Mail-Programm." },
  { id: "small-business", module: "invoices", href: "/admin", title: "Kleinunternehmer (§ 19 UStG)",
    words: "kleinunternehmer umsatzsteuer mehrwertsteuer mwst ohne steuer paragraph 19 befreit",
    text: "Verwaltung → Firmendaten → Haken bei „Kleinunternehmer nach § 19 UStG“. Rechnungen weisen dann keine Umsatzsteuer aus und tragen den gesetzlichen Hinweis." },
  { id: "tasks", module: "tasks", href: "/tasks", title: "Aufgaben und Board",
    words: "aufgabe aufgaben board kanban todo erledigt zuständig frist fällig priorität teilaufgabe timer zeit stoppen",
    text: "Aufgaben → „Neue Aufgabe“ oder Taste N. Auf dem Board ziehen Sie Karten zwischen Offen, In Arbeit, In Prüfung und Erledigt. Jede Aufgabe kann Frist, Priorität, zuständige Person, Teilaufgaben und einen Auftrag haben. Mit „Starten“ läuft ein Timer für die Aufgabe." },
  { id: "projects", module: "projects", href: "/projects", title: "Projekte",
    words: "projekt projekte fortschritt archivieren bündeln",
    text: "Projekte → „Neues Projekt“. Aufgaben ordnen Sie beim Anlegen einem Projekt zu; der Fortschrittsbalken zeigt, wie viele davon erledigt sind. Fertige Projekte lassen sich archivieren." },
  { id: "inventory", module: "inventory", href: "/inventory", title: "Inventar und Bestand",
    words: "inventar lager bestand artikel mindestbestand nachbestellen zugang abgang inventur korrektur buchung",
    text: "Inventar → „Neuer Artikel“ mit Preis und Mindestbestand. Über „Buchen“ erfassen Sie Zugang, Abgang oder eine Korrektur (Inventur); jede Buchung steht im Verlauf des Artikels. Artikel unter Mindestbestand erscheinen auf der Übersicht unter „Nachbestellen“." },
  { id: "calendar", module: "calendar", href: "/calendar", title: "Kalender und Kalender-Abo",
    words: "kalender termin termine abo outlook google iphone handy ical synchronisieren",
    text: "Kalender → „Neuer Termin“ oder auf einen freien Platz klicken. Ansichten: Monat, Woche, Tag und Liste (oben rechts). Ein Termin kann ganztägig sein, sich wiederholen (täglich, wöchentlich an bestimmten Tagen, monatlich, jährlich – mit Ende an einem Datum oder nach einer Anzahl), Teilnehmer aus dem Team haben, einem Kunden oder Auftrag zugeordnet sein und bis zu fünf Erinnerungen haben. Termine lassen sich mit der Maus auf einen anderen Tag oder eine andere Uhrzeit ziehen. Einen einzelnen Termin einer Serie sagt „Nur am … absagen“ ab. „Nur meine“ zeigt nur Termine, an denen Sie teilnehmen. Fällige Aufgaben und Aufträge mit Termin erscheinen automatisch. Für Outlook, Google oder das Handy: Verwaltung → Kalender-Abo → „Abo-Link erzeugen“ und den Link in der Kalender-App eintragen; Serien und Erinnerungen werden mit übertragen." },
  { id: "reminders", module: "calendar", href: "/calendar?wecker=1", title: "Erinnerungen und Wecker",
    words: "erinnerung erinnerungen wecker alarm klingeln ton benachrichtigung benachrichtigungen hinweis glocke schlummern weckzeit aufwachen push handy geschlossen hintergrund iphone",
    text: "Erinnerungen stellen Sie im Termin ein (z. B. 15 Minuten vorher). Zur Zeit klingelt Nahtbord, zeigt eine Karte mit „5 Min.“, „10 Min.“ (Schlummern) und „OK“ und – wenn erlaubt – einen Hinweis des Betriebssystems. Erlauben: Glocke oben rechts → „Hinweise auf diesem Gerät erlauben“; dort auch „Ton testen“. Wecker: Kalender → „Wecker“ → „Wecker stellen“: Uhrzeit, Wochentage oder einmaliges Datum, Bezeichnung und Ton. Ein Wecker klingelt, bis er ausgeschaltet wird. Ihre Wecker sieht niemand sonst. Push: Glocke → „Push auf diesem Gerät“ einschalten. Dann kommen Erinnerungen und Wecker auch bei geschlossenem Browser als Hinweis des Geräts – auf jedem Gerät einzeln einschalten. „Test-Push“ prüft es. Auf iPhone und iPad muss Nahtbord dafür über Teilen → „Zum Home-Bildschirm“ installiert sein. Beim Abmelden wird Push auf dem Gerät ausgeschaltet." },
  { id: "notes", module: "notes", href: "/notes", title: "Notizen",
    words: "notiz notizen merken anheften text schreiben schrift schriftart schriftgröße farbe fett kursiv unterstrichen liste aufzählung checkliste formatieren formatierung textmarker pdf drucken herunterladen download auswählen auswahl mehrere markieren",
    text: "Notizen → „Neue Notiz“. Links steht die Liste aller Notizen, rechts die geöffnete Notiz als Dokument; über „Kacheln“ oben rechts sehen Sie alle Notizen als Übersicht. Notizen werden beim Schreiben automatisch gespeichert, lassen sich anheften und farbig markieren. Das ganze Team sieht sie. Über dem Text steht eine Werkzeugleiste wie in einer Textverarbeitung: Überschriften, Schriftart, Schriftgröße, fett, kursiv, unterstrichen, durchgestrichen, Schriftfarbe, Textmarker, Aufzählung, nummerierte Liste, Checkliste, Einrücken, Ausrichtung, Link, Trennlinie und „Formatierung entfernen“. Text markieren, dann das Werkzeug anklicken. Strg+Z macht rückgängig. Als PDF speichern: in der geöffneten Notiz auf das Download-Symbol klicken, im Druckfenster „Als PDF speichern“ wählen. Mehrere Notizen auf einmal: „Auswählen“, Notizen anhaken, dann „PDF“ oder „Löschen“. Oben in der Notiz lässt sie sich einem Kunden oder Auftrag zuordnen; sie erscheint dann in der Kundenakte. „Aus Vorlage …“ legt ein Besprechungsprotokoll, einen Baustellenbericht, ein Übergabeprotokoll, eine Checkliste oder eine Telefonnotiz an. Über die Werkzeugleiste lassen sich Tabellen und Bilder einfügen." },
  { id: "times", module: "times", href: "/times", title: "Zeiterfassung, Urlaub und Krankheit",
    words: "zeiterfassung arbeitszeit stempeln einstempeln ausstempeln kommen gehen pause stunden urlaub krank krankheit überstunden feiertag",
    text: "Zeiterfassung → „Kommen“ startet den Arbeitstag, „Gehen“ beendet ihn. Zeiten lassen sich auch nachtragen: „Eintrag“ mit Datum, Beginn, Ende und Pause. Urlaub oder Krankheit eintragen: „Eintrag“ → oben die Art „Urlaub“ oder „Krank“ wählen → bei „Von“ den ersten und bei „Bis“ den letzten Tag angeben → „Speichern“. Nahtbord legt für jeden Werktag dazwischen einen ganzen Tag an; Uhrzeiten gibt es dabei nicht. Admins wählen im Eintrag zusätzlich die Person aus. Jede Person sieht nur ihre eigenen Zeiten; Admins sehen alle und können sie als CSV für die Lohnabrechnung exportieren. „Stundenzettel“ erzeugt die Monatsübersicht mit Unterschriftszeilen als PDF." },
  { id: "expenses", module: "expenses", href: "/expenses", title: "Ausgaben und Belege",
    words: "ausgabe ausgaben beleg belege kosten lieferant eingangsrechnung vorsteuer quittung tanken einkauf",
    text: "Ausgaben → „Neue Ausgabe“: Datum, Lieferant, Bruttobetrag und Steuersatz eintragen; Netto und Vorsteuer rechnet Nahtbord aus. Mit einer Kategorie (z. B. Material, Fahrzeug, Miete) sehen Sie in den Berichten, wohin das Geld geht. Unbezahlte Ausgaben lassen sich markieren." },
  { id: "reports", module: "reports", href: "/reports", title: "Berichte: Umsatz, Ausgaben, Ergebnis",
    words: "bericht berichte auswertung umsatz gewinn ergebnis statistik monat jahr zahlen umsatzsteuer vorsteuer zahllast beste kunden",
    text: "Berichte zeigt je Monat den Rechnungsumsatz, die Ausgaben und das Ergebnis, dazu Zahlungseingänge, offene Rechnungen, die umsatzstärksten Kunden und die Ausgaben je Kategorie. Die Umsatzsteuer-Übersicht ist eine Orientierung und ersetzt nicht die Voranmeldung beim Finanzamt." },
  { id: "team", module: null, href: "/admin", title: "Team und Rechte",
    words: "team mitarbeiter kollege kollegen einladen benutzer zugang rolle rollen rechte admin nur lesen hinzufügen",
    text: "Verwaltung → Team → „Mitglied“: Name, E-Mail, Startpasswort und Rolle eintragen. Rollen: Admin (Team und Einstellungen), Mitarbeiter (alles anlegen und bearbeiten), Nur lesen. Das Startpasswort bitte sicher weitergeben; die Person kann es danach selbst ändern." },
  { id: "areas", module: null, href: "/admin", title: "Bereiche ein- und ausblenden",
    words: "bereich bereiche ausblenden einblenden menü branche module anpassen zu viel übersichtlich",
    text: "Verwaltung → Arbeitsbereich: Branche wählen oder einzelne Bereiche an- und abhaken. Ausgeblendete Bereiche verschwinden aus dem Menü; ihre Daten bleiben erhalten und sind nach dem Einblenden wieder da." },
  { id: "profile", module: null, href: "/admin", title: "Firmendaten und Logo",
    words: "firmendaten firma logo briefkopf steuernummer iban bank adresse zahlungsbedingungen",
    text: "Verwaltung → Firmendaten: Adresse, Steuernummer, Bankverbindung und Zahlungsbedingungen. Sie erscheinen auf Angeboten, Auftragsbestätigungen und Rechnungen. Dort laden Sie auch Ihr Logo hoch." },
  { id: "export", module: null, href: "/admin", title: "Export und Datensicherung",
    words: "export exportieren csv excel sicherung backup daten herunterladen umziehen steuerberater",
    text: "Jede Liste hat oben einen CSV-Knopf für Excel. In Rechnungen, Ausgaben, Inventar und Aufgaben gibt es „Auswählen“: Einträge anhaken und gemeinsam bearbeiten, als PDF oder CSV ausgeben (z. B. Ausgaben für die Steuerberatung, mehrere Rechnungen als ein PDF, Bestellliste aus dem Inventar). Verwaltung → Export enthält alle Listen und für Admins den Gesamtexport aller Firmendaten als eine Datei. Die Datenbank Ihrer Firma liegt getrennt von anderen Firmen; Sicherungen richtet Ihr Betreuer auf dem Server ein." },
  { id: "search", module: null, href: "/", title: "Suche und Tastenkürzel",
    words: "suche suchen finden tastenkürzel shortcut tastatur schnell springen",
    text: "Strg + K (Mac: ⌘ + K) öffnet die Suche über alle Bereiche und alle Aktionen. Alt + Ziffer wechselt den Bereich, N legt eine Aufgabe an, ? öffnet diese Hilfe." },
  { id: "password", module: null, href: "/admin", title: "Passwort ändern",
    words: "passwort kennwort ändern vergessen anmelden login abmelden",
    text: "Verwaltung → Mein Passwort. Nach der Änderung werden alle anderen Geräte abgemeldet. Hat jemand sein Passwort vergessen, entfernt ein Admin den Zugang und legt ihn mit neuem Startpasswort wieder an." },
];

const fold = s => s.toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
const STOP = new Set("wie was wo wer kann ich man eine einen einer der die das den dem ein und oder ist sind mit fuer von zu im in auf mir mein meine bitte geht mache machen will moechte soll muss nicht noch auch nur dann wenn es sie wir".split(" "));

// Topics visible for the firm's areas, best match first. Scores whole-word and word-stem hits.
export function searchHelp(question, modules) {
  const tokens = fold(String(question)).split(/[^a-z0-9§-]+/).filter(t => t.length > 1 && !STOP.has(t));
  return TOPICS.filter(t => !t.module || modules.includes(t.module)).map(topic => {
    const words = fold(topic.words + " " + topic.title).split(/\s+/);
    let score = 0;
    for (const token of tokens) {
      if (words.includes(token)) score += 3;
      else if (token.length >= 4 && words.some(w => w.length >= 4 && (w.startsWith(token) || token.startsWith(w)))) score += 2;
    }
    return { topic, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).map(x => x.topic);
}
