export function NavRowCount({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 text-basalt-sm tabular-nums text-basalt-muted-foreground">
      {children}
    </span>
  );
}
