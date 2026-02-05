import * as React from "react";
import { ChevronLeft, ChevronRight, MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { Button } from "./button";

function Pagination({ className, ...props }: React.ComponentProps<"nav">) {
  return (
    <nav
      role="navigation"
      aria-label="pagination"
      className={cn("mx-auto flex w-full justify-center", className)}
      {...props}
    />
  );
}

function PaginationContent({ className, ...props }: React.ComponentProps<"ul">) {
  return (
    <ul className={cn("flex flex-row items-center gap-1", className)} {...props} />
  );
}

function PaginationItem(props: React.ComponentProps<"li">) {
  return <li {...props} />;
}

function PaginationLink({
  className,
  isActive,
  ...props
}: React.ComponentProps<"a"> & { isActive?: boolean }) {
  return (
    <a
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors",
        isActive
          ? "border border-input bg-background hover:bg-accent"
          : "hover:bg-accent hover:text-accent-foreground",
        "h-9 w-9",
        className
      )}
      {...props}
    />
  );
}

function PaginationPrevious({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("gap-1 pl-2.5", className)}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="hidden sm:inline">Previous</span>
    </Button>
  );
}

function PaginationNext({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={cn("gap-1 pr-2.5", className)}
      {...props}
    >
      <span className="hidden sm:inline">Next</span>
      <ChevronRight className="h-4 w-4" />
    </Button>
  );
}

function PaginationEllipsis({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      aria-hidden
      className={cn("flex h-9 w-9 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">More pages</span>
    </span>
  );
}

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
