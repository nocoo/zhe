import { LayerCard } from "@nocoo/basalt";
import type { LucideIcon } from "@nocoo/basalt/icons";

type AccentColor = "info" | "teal" | "warning" | "purple" | "success" | "destructive";

/** Color map for icon container background and icon foreground */
const ACCENT_CLASSES: Record<AccentColor, { bg: string; fg: string }> = {
  info: { bg: "bg-basalt-info/10", fg: "text-basalt-info" },
  teal: { bg: "bg-basalt-badge-teal/10", fg: "text-basalt-badge-teal" },
  warning: { bg: "bg-basalt-warning/10", fg: "text-basalt-warning" },
  purple: { bg: "bg-basalt-badge-purple/10", fg: "text-basalt-badge-purple" },
  success: { bg: "bg-basalt-success/10", fg: "text-basalt-success" },
  destructive: { bg: "bg-basalt-destructive/10", fg: "text-basalt-destructive" },
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
export function FeatureCard({
  title,
  description,
  icon: Icon,
  accent,
  children,
}: FeatureCardProps) {
  const colors = ACCENT_CLASSES[accent];

  return (
    <LayerCard padding="none">
      <LayerCard.Header className="px-4 py-3 md:px-5">
        <h3 className="flex items-center gap-3 text-sm font-medium">
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-basalt-widget ${colors.bg}`}
          >
            <Icon className={`h-4 w-4 ${colors.fg}`} strokeWidth={1.5} />
          </div>
          <span className="shrink-0">{typeof title === "string" ? title : title}</span>
          <span
            {...(typeof description === "string" ? { title: description } : {})}
            className="min-w-0 flex-1 truncate text-xs font-normal text-basalt-muted-foreground"
          >
            {description}
          </span>
        </h3>
      </LayerCard.Header>
      <LayerCard.Body className="px-4 pb-4 md:px-5 md:pb-4">{children}</LayerCard.Body>
    </LayerCard>
  );
}
