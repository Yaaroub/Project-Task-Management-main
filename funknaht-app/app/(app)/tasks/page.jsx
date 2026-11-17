import { Suspense } from "react";
import Tasks from "@/components/Tasks";

export const metadata = { title: "Aufgaben" };
export default function Page() {
  return <Suspense><Tasks /></Suspense>;
}
