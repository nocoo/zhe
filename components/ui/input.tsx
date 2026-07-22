import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Input density (see globals.css control contract):
 *   default → h-10 form fields
 *   sm      → h-8 toolbar / panel inline fields
 *
 * Native HTML `size` attribute is omitted so this prop can mean density.
 */
const inputVariants = cva(
  "flex w-full border border-border hover:border-foreground/20 bg-secondary shadow-xs transition-[color,box-shadow] outline-hidden selection:bg-primary selection:text-primary-foreground file:border-0 file:bg-transparent file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:border-transparent disabled:hover:border-transparent disabled:text-muted-foreground/38",
  {
    variants: {
      size: {
        default: "h-10 rounded-md px-3 py-2 text-base file:text-sm md:text-sm",
        sm: "h-8 rounded-widget px-2.5 py-1 text-xs file:text-xs",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface InputProps
  extends Omit<React.ComponentProps<"input">, "size">,
    VariantProps<typeof inputVariants> {}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, size, ...props }, ref) => {
    return (
      <input type={type} className={cn(inputVariants({ size }), className)} ref={ref} {...props} />
    );
  },
);
Input.displayName = "Input";

export { Input, inputVariants };
