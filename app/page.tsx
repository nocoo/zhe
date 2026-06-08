import { signIn, auth } from "@/auth";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import {
  BadgeFooter,
  BadgeHeader,
  RadialGlow,
} from "./page-parts/badge-chrome";
import { BadgeContent, TopRightControls } from "./page-parts/badge-content";

const BADGE_SHADOW = [
  "0 1px 2px rgba(0,0,0,0.06)",
  "0 4px 8px rgba(0,0,0,0.04)",
  "0 12px 24px rgba(0,0,0,0.06)",
  "0 24px 48px rgba(0,0,0,0.04)",
  "0 0 0 0.5px rgba(0,0,0,0.02)",
  "0 0 60px rgba(0,0,0,0.03)",
].join(", ");

function todayDateStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

async function signInWithGoogle(): Promise<void> {
  "use server";
  const h = await headers();
  const proto = h.get("x-forwarded-proto") || "http";
  const host = h.get("x-forwarded-host") || h.get("host") || "localhost:7006";
  const redirectTo = `${proto}://${host}/dashboard/overview`;
  await signIn("google", { redirectTo });
}

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect("/dashboard/overview");
  }

  const dateStr = todayDateStr();

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background p-4 overflow-hidden">
      <TopRightControls />
      <RadialGlow />

      <div className="flex flex-col items-center">
        <div
          className="relative aspect-[54/86] w-72 overflow-hidden rounded-2xl bg-card flex flex-col ring-1 ring-black/[0.08] dark:ring-white/[0.06]"
          style={{ boxShadow: BADGE_SHADOW }}
        >
          <BadgeHeader dateStr={dateStr} />
          <BadgeContent signInAction={signInWithGoogle} />
          <BadgeFooter />
        </div>
      </div>
    </div>
  );
}
