/**
 * WebSocket connection status indicator.
 * Shows a small indicator in the corner showing real-time connection status.
 */
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "@/lib/cn";

interface WebSocketStatusProps {
  isConnected: boolean;
  reconnectAttempts?: number;
  error?: string | null;
  className?: string;
}

export function WebSocketStatus({
  isConnected,
  reconnectAttempts = 0,
  error,
  className,
}: WebSocketStatusProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 text-xs",
        className
      )}
      title={
        isConnected
          ? "Real-time updates active"
          : error || `Reconnecting... (${reconnectAttempts})`
      }
    >
      {isConnected ? (
        <>
          <Wifi className="size-3.5 text-emerald-500" />
          <span className="text-emerald-600 dark:text-emerald-400">Live</span>
        </>
      ) : (
        <>
          <WifiOff className="size-3.5 text-amber-500 animate-pulse" />
          <span className="text-amber-600 dark:text-amber-400">
            {reconnectAttempts > 0 ? `Retry ${reconnectAttempts}` : "Offline"}
          </span>
        </>
      )}
    </div>
  );
}
