import { auth, signOut } from '@/auth';
import Link from 'next/link';
import { Link2, FolderOpen, LogOut, Search } from 'lucide-react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-background via-background to-muted text-foreground">
      {/* Header - Full Width at Top */}
      <header className="h-16 border-b border-border px-6 flex items-center gap-6 shrink-0">
        <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
          <Image
            src="/logo-128.png"
            width={32}
            height={32}
            alt="Zhe"
            priority
          />
          <span className="font-bold text-lg">ZHE.TO</span>
        </Link>
        <div className="flex-1 max-w-2xl">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="搜索链接..." className="pl-10 w-full" />
          </div>
        </div>
      </header>

      {/* Body: Sidebar + Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 border-r border-border flex flex-col">
          <nav className="flex-1 p-4">
            <div className="space-y-1">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors"
              >
                <Link2 className="w-4 h-4" />
                全部链接
              </Link>
              <Link
                href="/dashboard?folder=uncategorized"
                className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-accent transition-colors text-muted-foreground"
              >
                <FolderOpen className="w-4 h-4" />
                未分类
              </Link>
            </div>
          </nav>

          {/* User section at bottom */}
          <div className="border-t border-border p-4">
            <div className="flex items-center gap-3 mb-3">
              <Avatar className="w-8 h-8">
                {session?.user?.image && <AvatarImage src={session.user.image} />}
                <AvatarFallback>{session?.user?.name?.[0] || 'U'}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{session?.user?.name}</p>
                <p className="text-xs text-muted-foreground truncate">{session?.user?.email}</p>
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
                className="flex items-center gap-2 px-3 py-2 w-full rounded-md hover:bg-accent transition-colors text-sm text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
                退出登录
              </button>
            </form>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
