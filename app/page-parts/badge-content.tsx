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
    <div className="flex flex-col items-center p-basalt-card-lg">
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

      <form action={signInAction} className="mt-basalt-card-lg w-full">
        <Button type="submit" size="lg" className="w-full" icon={<GoogleIcon />}>
          {localIdentity ? "Local sign in" : "Continue with Google"}
        </Button>
      </form>

      <p className="mt-3 text-center text-basalt-xs text-basalt-muted-foreground">
        点击登录即表示您同意服务条款
      </p>
    </div>
  );
}
