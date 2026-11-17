import { Suspense } from "react";
import Expenses from "@/components/Expenses";

export const metadata = { title: "Ausgaben" };
export default function Page() {
  return <Suspense><Expenses /></Suspense>;
}
