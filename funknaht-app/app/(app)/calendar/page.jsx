import { Suspense } from "react";
import Calendar from "@/components/Calendar";

export const metadata = { title: "Kalender" };
export default function Page() {
  return <Suspense><Calendar /></Suspense>;
}
