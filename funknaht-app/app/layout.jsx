import { Bricolage_Grotesque, Source_Serif_4 } from "next/font/google";
import "./globals.css";

const sans = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const serif = Source_Serif_4({ subsets: ["latin"], style: ["normal", "italic"], variable: "--font-serif", display: "swap" });

export const metadata = {
  title: { default: "Nahtbord – Alles an Bord.", template: "%s · Nahtbord" },
  description: "Nahtbord: Aufgaben, Projekte, Lager, Notizen und Termine für Ihren Betrieb an einem Ort. Entwickelt von FUNKNAHT.",
  applicationName: "Nahtbord",
  authors: [{ name: "FUNKNAHT", url: "https://hexel-pi.vercel.app/" }],
};
export const viewport = { themeColor: "#061A1D" };

// Applies the saved theme before first paint, so nothing flickers.
const themeScript = `try{var t=localStorage.getItem("theme");if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }) {
  return (
    <html lang="de" data-theme="dark" className={`${sans.variable} ${serif.variable}`} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>{children}</body>
    </html>
  );
}
