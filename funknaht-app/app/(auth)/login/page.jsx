import { redirect } from "next/navigation";
import AuthForm from "@/components/AuthForm";
import { currentSession } from "@/lib/session";

export const metadata = { title: "Anmelden" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (await currentSession()) redirect("/");
  return <AuthForm mode="login" />;
}
