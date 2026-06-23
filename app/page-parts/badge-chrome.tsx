import { Zap } from "lucide-react";
import { Barcode } from "@/components/barcode";

/** Header strip with punch hole, brand text, visitor label + barcode row. */
export function BadgeHeader({ dateStr }: { dateStr: string }) {
  return (
    <div className="bg-primary px-5 py-4">
      <div className="flex items-center justify-between">
        {/* Punch hole */}
        <div
          className="h-4 w-8 rounded-full bg-background/80"
          style={{
            boxShadow:
              "inset 0 1.5px 3px rgba(0,0,0,0.35), inset 0 -0.5px 1px rgba(255,255,255,0.1)",
          }}
        />
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary-foreground" strokeWidth={1.5} />
          <span className="text-sm font-semibold text-primary-foreground">
            zhe.
          </span>
        </div>
        <span className="text-[10px] font-medium uppercase tracking-widest text-primary-foreground/60">
          Visitor
        </span>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-[9px] font-mono text-primary-foreground/40 tracking-wider">
          ID {dateStr}
        </span>
        <div className="h-6">
          <Barcode />
        </div>
      </div>
    </div>
  );
}

export function BadgeFooter() {
  return (
    <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center bg-background py-2.5">
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
        <span className="text-[10px] text-muted-foreground">
          Secure authentication
        </span>
      </div>
    </div>
  );
}

/** Radial glow background that sits behind the badge card. */
export function RadialGlow() {
  const gradient = [
    "radial-gradient(ellipse 70% 55% at 50% 50%,",
    "hsl(var(--foreground) / 0.045) 0%,",
    "hsl(var(--foreground) / 0.042) 10%,",
    "hsl(var(--foreground) / 0.036) 20%,",
    "hsl(var(--foreground) / 0.028) 32%,",
    "hsl(var(--foreground) / 0.020) 45%,",
    "hsl(var(--foreground) / 0.012) 58%,",
    "hsl(var(--foreground) / 0.006) 72%,",
    "hsl(var(--foreground) / 0.002) 86%,",
    "transparent 100%)",
  ].join(" ");
  return (
    <div
      className="pointer-events-none absolute inset-0"
      style={{ background: gradient }}
    />
  );
}
