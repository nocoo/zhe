import { auth, signOut } from '@/auth';
import Link from 'next/link';
import { Link2, FolderOpen, LogOut } from 'lucide-react';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="min-h-screen bg-black text-white flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-gray-800 p-4 flex flex-col">
        <div className="mb-8">
          <Link href="/" className="text-2xl font-bold">
            这
          </Link>
        </div>

        <nav className="flex-1 space-y-1">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors"
          >
            <Link2 className="w-4 h-4" />
            All Links
          </Link>
          <Link
            href="/dashboard?folder=uncategorized"
            className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-gray-800 transition-colors text-gray-400"
          >
            <FolderOpen className="w-4 h-4" />
            Uncategorized
          </Link>
        </nav>

        {/* User section */}
        <div className="border-t border-gray-800 pt-4 mt-4">
          <div className="flex items-center gap-3 px-3 py-2">
            {session?.user?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.image}
                alt={session.user.name || 'User'}
                className="w-8 h-8 rounded-full"
              />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {session?.user?.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {session?.user?.email}
              </p>
            </div>
          </div>
          <form
            action={async () => {
              'use server';
              await signOut({ redirectTo: '/' });
            }}
          >
            <button
              type="submit"
              className="flex items-center gap-3 px-3 py-2 w-full rounded-md hover:bg-gray-800 transition-colors text-gray-400 text-sm"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
