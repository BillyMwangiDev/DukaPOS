import { forwardRef } from "react";
import { cn } from "@/lib/cn";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  size?: "default" | "sm" | "lg" | "icon";
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 cursor-pointer active:scale-95 [&_svg]:size-4 [&_svg]:shrink-0",
          variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary",
          variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90",
          variant === "outline" && "border border-input bg-background hover:bg-accent",
          variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
          variant === "ghost" && "hover:bg-accent",
          size === "default" && "h-10 px-4 py-2",
          size === "sm" && "h-8 rounded-md px-3 text-sm",
          size === "lg" && "h-12 rounded-md px-8 text-lg",
          size === "icon" && "h-9 w-9",
          className
        )}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";
export { Button };
