import { getFolders } from "@/actions/folders";
import { signOut } from "@/auth";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth-context";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  // Server action that can be passed to client components
  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/" });
  }

  const foldersResult = await getFolders();
  const initialFolders = foldersResult.data ?? [];

  return (
    <AppShell
      {...(session?.user ? { user: session.user } : {})}
      signOutAction={handleSignOut}
      initialFolders={initialFolders}
    >
      {children}
    </AppShell>
  );
}
