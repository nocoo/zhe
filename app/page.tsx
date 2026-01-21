import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';
import Image from 'next/image';

export default async function Home() {
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted p-4">
      <div className="w-full max-w-sm animate-fade-in">
        {/* Card Style */}
        <div className="relative overflow-hidden border-2 shadow-2xl rounded-lg">
          {/* Logo Area */}
          <div className="flex justify-center py-12 bg-gradient-to-b from-muted/30 to-transparent">
            <div className="relative">
              <div className="w-40 h-40 rounded-full border-4 border-background bg-muted flex items-center justify-center shadow-xl overflow-hidden">
                <Image
                  src="/logo-128.png"
                  width={156}
                  height={156}
                  alt="Zhe Logo"
                  priority
                />
              </div>
            </div>
          </div>

          {/* Card Content */}
          <div className="space-y-6 px-6 pb-8 bg-card">
            {/* Placeholder lines for ID info */}
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-16 h-2 bg-muted rounded" />
                <div className="flex-1 h-2 bg-muted/50 rounded" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-2 bg-muted rounded" />
                <div className="flex-1 h-2 bg-muted/50 rounded" />
              </div>
              <div className="flex items-center gap-3">
                <div className="w-20 h-2 bg-muted rounded" />
                <div className="flex-1 h-2 bg-muted/50 rounded" />
              </div>
            </div>

            {/* Divider */}
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-dashed" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">验证身份</span>
              </div>
            </div>

            {/* Login button */}
            <form
              action={async () => {
                'use server';
                await signIn('google', { redirectTo: '/dashboard' });
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-neutral-900 text-white border border-neutral-700 rounded-lg font-medium hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#ffffff"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#ffffff"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#ffffff"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#ffffff"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Sign in with Google
              </button>
            </form>

            <p className="text-center text-xs text-muted-foreground">
              点击登录即表示您同意服务条款
            </p>
          </div>

          {/* Bottom barcode effect */}
          <div className="h-12 bg-muted/30 flex items-center justify-center gap-0.5 px-6">
            {Array.from({ length: 40 }).map((_, i) => (
              <div
                key={i}
                className="bg-foreground/80 h-6"
                style={{ width: Math.random() > 0.5 ? "2px" : "1px" }}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          © {new Date().getFullYear()} Zhe.to
        </p>
      </div>
    </div>
  );
}
