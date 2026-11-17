import { Suspense } from "react";
import Inventory from "@/components/Inventory";

export const metadata = { title: "Inventar" };
export default function Page() {
  return <Suspense><Inventory /></Suspense>;
}
