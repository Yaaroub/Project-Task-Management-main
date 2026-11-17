import { Suspense } from "react";
import Times from "@/components/Times";

export const metadata = { title: "Zeiterfassung" };
export default function Page() {
  return <Suspense><Times /></Suspense>;
}
