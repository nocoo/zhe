import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';
import Image from 'next/image';

export default async function Home() {
  // If already logged in, redirect to dashboard
  const session = await auth();
  if (session?.user) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-neutral-950">
      {/* Badge card with glow effect */}
      <div className="relative">
        {/* White glow effect */}
        <div className="absolute -inset-4 bg-white/20 rounded-3xl blur-2xl" />
        <div className="absolute -inset-2 bg-white/10 rounded-2xl blur-xl" />
        
        {/* Main badge card */}
        <div className="relative bg-black rounded-2xl px-16 py-20 border border-white/10 shadow-2xl">
          {/* Badge hole */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2 w-8 h-3 bg-neutral-800 rounded-full" />
          
          {/* Logo */}
          <div className="flex justify-center mb-8">
            <Image
              src="/logo-128.png"
              width={128}
              height={128}
              alt="Zhe"
              priority
            />
          </div>
          
          {/* Site name */}
          <h1 className="text-white text-2xl font-light text-center tracking-widest mb-2">
            ZHE.TO
          </h1>
          <p className="text-neutral-500 text-sm text-center mb-10">
            Minimalist URL Shortener
          </p>
          
          {/* Login button */}
          <form
            action={async () => {
              'use server';
              await signIn('google', { redirectTo: '/dashboard' });
            }}
          >
            <button
              type="submit"
              className="w-full flex items-center justify-center gap-3 px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-neutral-200 transition-colors cursor-pointer"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              Sign in with Google
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
