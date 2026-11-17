import "server-only";
import { getSetting } from "./db";

// Firm details printed on offers and order confirmations.
export const PROFILE_FIELDS = [
  ["name", "Firmenname", 160], ["owner", "Inhaber/Geschäftsführung", 120], ["street", "Straße", 160], ["zip", "PLZ", 10], ["city", "Ort", 80],
  ["phone", "Telefon", 40], ["email", "E-Mail", 200], ["web", "Website", 200], ["taxId", "Steuernummer / USt-IdNr.", 60],
  ["bank", "Bank", 120], ["iban", "IBAN", 40], ["bic", "BIC", 20], ["terms", "Zahlungsbedingungen", 300], ["footer", "Schlusstext", 600],
];

export function getProfile(org) {
  const stored = getSetting(org.id, "profile", {});
  const profile = Object.fromEntries(PROFILE_FIELDS.map(([k]) => [k, stored[k] || ""]));
  profile.logo = stored.logo || "";
  profile.logoStyle = stored.logoStyle || {};
  profile.logoWidth = stored.logoWidth || 120;
  if (!profile.name) profile.name = org.name;
  if (!profile.terms) profile.terms = "Zahlbar innerhalb von 14 Tagen ohne Abzug.";
  profile.smallBusiness = !!stored.smallBusiness; // Kleinunternehmer nach § 19 UStG: keine Umsatzsteuer
  // Fields required by § 14 Abs. 4 UStG on every invoice.
  profile.missingForInvoice = [["name", "Firmenname"], ["street", "Straße"], ["zip", "PLZ"], ["city", "Ort"], ["taxId", "Steuernummer oder USt-IdNr."]]
    .filter(([k]) => !profile[k]).map(([, l]) => l);
  return profile;
}
