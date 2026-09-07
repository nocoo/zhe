"use client";

import { Input as BasaltInput } from "@nocoo/basalt/components/input";
import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = Omit<React.ComponentProps<"input">, "size"> & {
  size?: "sm" | "default" | "lg";
};

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ size, className, type, ...props }, ref) => {
    const basaltSize = size === "sm" ? "sm" : size === "lg" ? "lg" : "default";
    return (
      <BasaltInput
        ref={ref}
        size={basaltSize}
        className={
          size === "sm"
            ? cn("rounded-widget", className)
            : size === "lg"
              ? className
              : cn("h-10", className)
        }
        {...(type === undefined ? {} : { type })}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";
