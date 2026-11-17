import { handle } from "@/lib/http";
import { HttpError } from "@/lib/db";
import { report } from "@/lib/reports";

export const dynamic = "force-dynamic";

export const GET = handle((request, params, session) => {
  const year = Number(new URL(request.url).searchParams.get("year")) || new Date().getFullYear();
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new HttpError(400, "Jahr ungültig.");
  return report(session, year);
});
