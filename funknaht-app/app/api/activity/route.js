import { handle } from "@/lib/http";
import { collection } from "@/lib/db";

export const dynamic = "force-dynamic";

// Full audit log of the firm, newest first (admins only).
export const GET = handle((request, params, session) =>
  collection("activity", session.org.id).list().sort((a, b) => b.createdAt.localeCompare(a.createdAt)), "admin");
