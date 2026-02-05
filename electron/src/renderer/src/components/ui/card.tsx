import { cn } from "@/lib/cn";

function Card({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        className
      )}
      {...props}
    />
  );
}
function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col space-y-1.5 p-4", className)} {...props} />;
}
function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-lg font-semibold", className)} {...props} />;
}
function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("p-4 pt-0", className)} {...props} />;
}
export { Card, CardHeader, CardTitle, CardContent };
