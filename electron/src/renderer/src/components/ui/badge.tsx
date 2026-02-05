import { cn } from "@/lib/cn";

function Badge({ className, variant = "default", ...props }: React.ComponentProps<"div"> & { variant?: "default" | "secondary" | "destructive" | "outline" }) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
        variant === "default" && "bg-primary text-primary-foreground",
        variant === "secondary" && "bg-secondary text-secondary-foreground",
        variant === "destructive" && "bg-destructive text-destructive-foreground",
        variant === "outline" && "border border-input bg-background",
        className
      )}
      {...props}
    />
  );
}
export { Badge };
