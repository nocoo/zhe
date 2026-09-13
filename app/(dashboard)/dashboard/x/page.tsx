import type { Metadata } from "next";
import { XLibraryPage } from "@/components/dashboard/x-library-page";

export const metadata: Metadata = { title: "X 收藏 · Zhe" };

export default function XLibraryRoute() {
  return <XLibraryPage />;
}
