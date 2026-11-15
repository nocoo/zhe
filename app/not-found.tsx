import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-basalt-background">
      <h1 className="text-[18vw] leading-none font-light text-basalt-muted-foreground font-display tracking-tight select-none">
        404
      </h1>
      <Link
        href="/"
        className="mt-6 text-sm text-basalt-muted-foreground underline underline-offset-4 hover:text-basalt-foreground transition-colors"
      >
        返回首页
      </Link>
    </div>
  );
}
