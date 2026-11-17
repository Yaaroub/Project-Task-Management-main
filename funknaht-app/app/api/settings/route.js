import { handle, body } from "@/lib/http";
import { HttpError, getSetting, setSetting, logActivity } from "@/lib/db";
import { PROFILE_FIELDS, getProfile } from "@/lib/profile";
import { getWorkspace, saveWorkspace } from "@/lib/workspace";
import { aiStatus } from "@/lib/assistant";

export const dynamic = "force-dynamic";

export const GET = handle((request, params, session) => ({
  announcement: getSetting(session.org.id, "announcement", ""),
  profile: getProfile(session.org),
  workspace: getWorkspace(session.org.id),
  ai: aiStatus(),
}));

// Admins change the announcement and/or the firm details used on documents (offers, confirmations).
export const PUT = handle(async (request, params, session) => {
  const data = await body(request);
  const out = {};
  if ("announcement" in data) {
    if (typeof data.announcement !== "string" || data.announcement.length > 500) throw new HttpError(400, "Bitte maximal 500 Zeichen eingeben.");
    out.announcement = setSetting(session.org.id, "announcement", data.announcement.trim());
    logActivity(session, "settings", "Mitteilung auf der Übersicht geändert");
  }
  if ("profile" in data) {
    if (!data.profile || typeof data.profile !== "object") throw new HttpError(400, "Firmendaten ungültig.");
    const profile = {};
    for (const [key, label, max] of PROFILE_FIELDS) {
      const value = data.profile[key] ?? "";
      if (typeof value !== "string" || value.length > max) throw new HttpError(400, `${label}: maximal ${max} Zeichen.`);
      profile[key] = value.trim();
    }
    const previous = getProfile(session.org);
    profile.logo = data.profile.logo ?? previous.logo;
    profile.logoWidth = data.profile.logoWidth ?? previous.logoWidth;
    if (typeof profile.logo !== "string" || profile.logo.length > 400000 || (profile.logo && !/^data:image\/png;base64,iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(profile.logo))) throw new HttpError(400, "Ungültiges Firmenlogo.");
    if (!Number.isInteger(profile.logoWidth) || profile.logoWidth < 60 || profile.logoWidth > 200) throw new HttpError(400, "Ungültige Logobreite.");
    const style = data.profile.logoStyle ?? previous.logoStyle;
    if (!style || typeof style !== "object" || Array.isArray(style)) throw new HttpError(400, "Ungültige Logoeinstellungen.");
    profile.logoStyle = {};
    for (const [key, min, max, initial] of [["zoom", 50, 250, 100], ["x", -50, 50, 0], ["y", -50, 50, 0], ["angle", -180, 180, 0]]) {
      const value = style[key] ?? initial;
      if (!Number.isInteger(value) || value < min || value > max) throw new HttpError(400, "Ungültiger Bildausschnitt.");
      profile.logoStyle[key] = value;
    }
    profile.logoStyle.background = style.background ?? "transparent";
    if (!["transparent", "#ffffff", "#18212a"].includes(profile.logoStyle.background)) throw new HttpError(400, "Ungültiger Logohintergrund.");
    profile.logoStyle.mono = style.mono === true;
    profile.smallBusiness = !!data.profile.smallBusiness;
    setSetting(session.org.id, "profile", profile);
    out.profile = getProfile(session.org);
    logActivity(session, "settings", "Firmendaten für Dokumente geändert");
  }
  // Kind of business, visible areas, AI help on/off, "Erste Schritte" hidden.
  if ("workspace" in data) {
    out.workspace = saveWorkspace(session.org.id, data.workspace);
    if ("modules" in data.workspace || "industry" in data.workspace) logActivity(session, "settings", "Sichtbare Bereiche geändert");
  }
  return out;
}, "admin");
