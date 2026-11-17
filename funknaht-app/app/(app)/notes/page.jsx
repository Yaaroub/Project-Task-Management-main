import { Suspense } from "react";
import Notes from "@/components/Notes";

export const metadata = { title: "Notizen" };
export default function Page() {
  return <Suspense><Notes /></Suspense>;
}
