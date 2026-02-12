import { auth, signOut } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  // Server action that can be passed to client components
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  return (
    <DashboardShell user={session?.user} signOutAction={handleSignOut}>
      {children}
    </DashboardShell>
  );
}
