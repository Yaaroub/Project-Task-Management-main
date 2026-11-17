import { handle } from "@/lib/http";
import { overview } from "@/lib/overview";

export const dynamic = "force-dynamic";
export const GET = handle((request, params, session) => overview(session.org.id));
