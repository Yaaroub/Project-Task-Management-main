import { Suspense } from "react";
import Customers from "@/components/Customers";

export const metadata = { title: "Kunden" };
export default function Page() {
  return <Suspense><Customers /></Suspense>;
}
