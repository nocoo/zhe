import { GithubIcon } from "@/components/github-icon";
import { GoogleIcon } from "@/components/google-icon";
import { ThemeToggle } from "@/components/theme-toggle";

export function TopRightControls() {
  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
      <a
        href="https://github.com/nocoo/zhe"
        target="_blank"
        rel="noopener noreferrer"
        className="flex h-8 w-8 items-center justify-center rounded-lg text-basalt-muted-foreground transition-colors hover:bg-basalt-accent hover:text-basalt-foreground"
        title="GitHub"
      >
        <GithubIcon className="h-[18px] w-[18px]" strokeWidth={1.5} />
      </a>
      <ThemeToggle />
    </div>
  );
}

/**
 * Inner content of the visitor badge: logo, greeting, Google sign-in form,
 * and terms blurb.
 */
export function BadgeContent({ signInAction }: { signInAction: () => Promise<void> }) {
  return (
    <div className="flex flex-1 flex-col items-center px-6 pt-6 pb-14">
      <div className="h-24 w-24 overflow-hidden rounded-full bg-basalt-secondary p-2.5 ring-1 ring-basalt-border">
        <img
          src="/logo-80.png"
          alt="Zhe"
          width={80}
          height={80}
          className="h-full w-full object-contain"
        />
      </div>

      <p className="mt-5 text-lg font-semibold text-basalt-foreground">就是这</p>
      <p className="mt-1 text-xs text-basalt-muted-foreground">登录以管理您的短链接</p>

      <div className="mt-5 h-px w-full bg-basalt-border" />

      <div className="flex-1" />

      <form action={signInAction}>
        <button
          type="submit"
          className="flex w-full cursor-pointer items-center justify-center gap-2.5 rounded-xl bg-basalt-secondary px-4 py-3 text-sm font-medium text-basalt-foreground transition-colors hover:bg-basalt-accent"
        >
          <GoogleIcon className="h-4 w-4" />
          Continue with Google
        </button>
      </form>

      <p className="mt-3 text-center text-[10px] leading-relaxed text-basalt-muted-foreground/60">
        点击登录即表示您同意服务条款
      </p>
    </div>
  );
}
