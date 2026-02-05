import { useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";

function Dialog({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    if (open) window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onOpenChange]);
  if (!open) return null;
  const overlay = (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/60"
        onClick={() => onOpenChange(false)}
        aria-hidden
      />
      <div className="relative z-50">{children}</div>
    </div>
  );
  return createPortal(overlay, document.body);
}

function DialogContent({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "bg-white dark:bg-[#334155] text-foreground shadow-2xl rounded-lg border border-border p-6 max-w-md w-full mx-4",
        "ring-2 ring-black/5 dark:ring-white/5",
        "min-h-[200px]",
        className
      )}
      {...props}
    />
  );
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />;
}
function DialogTitle({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-lg font-semibold", className)} {...props} />;
}
function DialogDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2 mt-4 pt-4", className)}
      {...props}
    />
  );
}

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter };
