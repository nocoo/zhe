"use client";

import type { ButtonProps as BasaltButtonProps } from "@nocoo/basalt/components/button";
import { Button as BasaltButton } from "@nocoo/basalt/components/button";
import * as React from "react";
import { cn } from "@/lib/utils";

type ZheSize = BasaltButtonProps["size"] | "xs" | "icon-sm";

export interface ButtonProps extends Omit<BasaltButtonProps, "size"> {
  size?: ZheSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ size, className, ...props }, ref) => {
    if (size === "xs") {
      return (
        <BasaltButton ref={ref} size="sm" className={cn("rounded-widget", className)} {...props} />
      );
    }
    if (size === "icon-sm") {
      return <BasaltButton ref={ref} size="icon" className={cn("h-8 w-8", className)} {...props} />;
    }
    if (size === "sm") {
      return <BasaltButton ref={ref} size="default" className={className} {...props} />;
    }
    if (size === "default" || size == null) {
      return <BasaltButton ref={ref} size="lg" className={className} {...props} />;
    }
    if (size === "icon") {
      return (
        <BasaltButton ref={ref} size="icon" className={cn("h-10 w-10", className)} {...props} />
      );
    }
    return <BasaltButton ref={ref} size={size} className={className} {...props} />;
  },
);
Button.displayName = "Button";
