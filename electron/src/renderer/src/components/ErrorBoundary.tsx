import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render errors in admin (or other) sections so one broken component
 * doesn't blank the whole page.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onError?.(error, info);
    console.error("ErrorBoundary caught:", error, info);
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="size-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold text-foreground">Something went wrong</h2>
          <p className="text-sm text-muted-foreground mt-2 max-w-md">
            This section could not be loaded. Check the console for details.
          </p>
          <p className="text-xs text-muted-foreground mt-2 font-mono break-all">
            {this.state.error.message}
          </p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try again
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
