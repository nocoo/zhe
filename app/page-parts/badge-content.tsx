import { Button, ThemeToggle } from "@nocoo/basalt";
import { ProjectLinks } from "@nocoo/basalt/components/app-header";
import { EnvironmentControl } from "@/components/environment-control";
import { GoogleIcon } from "@/components/google-icon";

export function TopRightControls() {
  return (
    <div className="absolute top-4 right-4 z-10 flex items-center gap-1">
      <EnvironmentControl />
      <ProjectLinks
        github="nocoo/zhe"
        hexly="zhe"
        name="Zhe"
        githubLabel="GitHub"
        hexlyLabel="Zhe on hexly.ai"
        newTabLabel=""
      />
      <ThemeToggle
        aria-label="切换主题"
        labels={{
          light: "切换为浅色主题",
          dark: "切换为深色主题",
          system: "跟随系统主题",
        }}
      />
    </div>
  );
}

/**
 * Inner content of the visitor badge: logo, greeting, Google sign-in form,
 * and terms blurb.
 */
export function BadgeContent({
  signInAction,
  localIdentity = false,
}: {
  signInAction: () => Promise<void>;
  localIdentity?: boolean;
}) {
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
        <Button
          type="submit"
          variant="secondary"
          className="w-full whitespace-nowrap"
          icon={<GoogleIcon />}
        >
          {localIdentity ? "Local sign in" : "Continue with Google"}
        </Button>
      </form>

      <p className="mt-3 text-center text-[10px] leading-relaxed text-basalt-muted-foreground/60">
        点击登录即表示您同意服务条款
      </p>
    </div>
  );
}
