import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

type AccentColor = "info" | "teal" | "warning" | "purple" | "success" | "destructive";

/** Color map for icon container background and icon foreground */
const ACCENT_CLASSES: Record<AccentColor, { bg: string; fg: string }> = {
  info: { bg: "bg-info/10", fg: "text-info" },
  teal: { bg: "bg-teal/10", fg: "text-teal" },
  warning: { bg: "bg-warning/10", fg: "text-warning" },
  purple: { bg: "bg-purple/10", fg: "text-purple" },
  success: { bg: "bg-success/10", fg: "text-success" },
  destructive: { bg: "bg-destructive/10", fg: "text-destructive" },
};

interface FeatureCardProps {
  /** Section title */
  title: React.ReactNode;
  /** Brief description shown below the title */
  description: React.ReactNode;
  /** Lucide icon component */
  icon: LucideIcon;
  /** Accent color for the icon badge */
  accent: AccentColor;
  /** Card body content */
  children: React.ReactNode;
}

/**
 * Shared feature-section card used across backy, xray, storage, and other
 * dashboard settings pages. Renders a coloured icon badge, title, description,
 * separator, then the children content.
 */
export function FeatureCard({ title, description, icon: Icon, accent, children }: FeatureCardProps) {
  const colors = ACCENT_CLASSES[accent];

  return (
    <Card>
      <CardHeader className="px-4 py-3 md:px-5 md:py-4">
        <CardTitle className="flex items-center gap-3 text-sm font-medium">
          <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${colors.bg}`}>
            <Icon className={`h-4 w-4 ${colors.fg}`} strokeWidth={1.5} />
          </div>
          {typeof title === "string" ? <span>{title}</span> : title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 md:px-5 md:pb-5">
        <p className="mb-4 text-sm text-muted-foreground">{description}</p>
        <Separator className="mb-4" />
        {children}
      </CardContent>
    </Card>
  );
}
