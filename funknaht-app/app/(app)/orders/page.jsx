import { Suspense } from "react";
import Orders from "@/components/Orders";

export const metadata = { title: "Aufträge" };
export default function Page() {
  return <Suspense><Orders /></Suspense>;
}
