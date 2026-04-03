import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive:
          "bg-destructive/15 text-destructive dark:text-red-400 border-destructive/25",
        outline: "border-border text-foreground",
        ghost: "text-muted-foreground hover:bg-accent",
        warning:
          "bg-warning/15 text-warning dark:text-yellow-400 border-warning/25",
        success:
          "bg-success/15 text-success dark:text-green-400 border-success/25",
        info:
          "bg-info/15 text-info dark:text-blue-400 border-info/25",
        purple:
          "bg-purple/15 text-purple dark:text-purple-400 border-purple/25",
        teal:
          "bg-teal/15 text-teal dark:text-teal-400 border-teal/25",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
