// Makes Nahtbord installable as an app on phones and desktops ("Zum Startbildschirm hinzufügen").
export default function manifest() {
  return {
    name: "Nahtbord – Alles an Bord.",
    short_name: "Nahtbord",
    description: "Aufgaben, Projekte, Lager, Notizen und Termine für Ihren Betrieb. Entwickelt von FUNKNAHT.",
    lang: "de",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#061A1D",
    theme_color: "#061A1D",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
    shortcuts: [
      { name: "Neue Aufgabe", url: "/tasks?new=1" },
      { name: "Kalender", url: "/calendar" },
      { name: "Inventar", url: "/inventory" },
    ],
  };
}
