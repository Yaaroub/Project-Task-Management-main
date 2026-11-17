import { Suspense } from "react";
import Invoices from "@/components/Invoices";

export const metadata = { title: "Rechnungen" };
export default function Page() {
  return <Suspense><Invoices /></Suspense>;
}
