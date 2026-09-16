import type { Metadata } from "next";
import { GitHubLibraryPage } from "@/components/dashboard/github-library-page";

export const metadata: Metadata = { title: "GitHub 收藏 · Zhe" };

export default function GitHubLibraryRoute() {
  return <GitHubLibraryPage />;
}
