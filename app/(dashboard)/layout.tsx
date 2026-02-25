import { signOut } from "@/auth";
import { getSession } from "@/lib/auth-context";
import { DashboardShell } from "@/components/dashboard-shell";
import { getFolders } from "@/actions/folders";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();

  // Server action that can be passed to client components
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const foldersResult = await getFolders();
  const initialFolders = foldersResult.data ?? [];

  return (
    <DashboardShell
      user={session?.user}
      signOutAction={handleSignOut}
      initialFolders={initialFolders}
    >
      {children}
    </DashboardShell>
  );
}
