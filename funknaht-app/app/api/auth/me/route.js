import { handle } from "@/lib/http";

export const dynamic = "force-dynamic";
export const GET = handle((request, params, session) => session);
