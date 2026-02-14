import { auth, signOut } from "@/auth";
import { DashboardShell } from "@/components/dashboard-shell";
import { getFolders } from "@/actions/folders";

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
