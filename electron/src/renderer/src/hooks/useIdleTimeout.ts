/**
 * Idle Timeout Hook - Auto-logout for cashier accountability
 * 
 * Forces logout or lock screen after period of inactivity.
 * This prevents cashier "sharing" where one person uses another's session.
 */
import { useState, useEffect, useCallback, useRef } from "react";

interface UseIdleTimeoutOptions {
  /** Timeout in milliseconds (default: 5 minutes) */
  timeoutMs?: number;
  /** Warning time before logout in milliseconds (default: 30 seconds) */
  warningMs?: number;
  /** Callback when idle timeout is reached */
  onIdle: () => void;
  /** Callback when warning period starts */
  onWarning?: () => void;
  /** Whether the timeout is enabled */
  enabled?: boolean;
}

interface UseIdleTimeoutReturn {
  /** Whether we're in warning period before logout */
  isWarning: boolean;
  /** Seconds remaining before logout (only during warning) */
  secondsRemaining: number;
  /** Reset the idle timer (e.g., on activity) */
  reset: () => void;
  /** Pause the idle timer temporarily */
  pause: () => void;
  /** Resume the idle timer */
  resume: () => void;
}

// Events that indicate user activity
const ACTIVITY_EVENTS = [
  "mousedown",
  "mousemove",
  "keydown",
  "scroll",
  "touchstart",
  "click",
  "focus",
] as const;

export function useIdleTimeout({
  timeoutMs = 5 * 60 * 1000, // 5 minutes default
  warningMs = 30 * 1000, // 30 seconds warning
  onIdle,
  onWarning,
  enabled = true,
}: UseIdleTimeoutOptions): UseIdleTimeoutReturn {
  const [isWarning, setIsWarning] = useState(false);
  const [secondsRemaining, setSecondsRemaining] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningTimeoutRef.current) {
      clearTimeout(warningTimeoutRef.current);
      warningTimeoutRef.current = null;
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }
  }, []);

  // Start/reset the idle timer
  const reset = useCallback(() => {
    if (!enabled || isPaused) return;

    clearTimers();
    setIsWarning(false);
    setSecondsRemaining(0);
    lastActivityRef.current = Date.now();

    // Start warning timer (timeout - warning)
    const warningDelay = Math.max(0, timeoutMs - warningMs);
    warningTimeoutRef.current = setTimeout(() => {
      setIsWarning(true);
      setSecondsRemaining(Math.ceil(warningMs / 1000));
      onWarning?.();

      // Start countdown
      countdownRef.current = setInterval(() => {
        setSecondsRemaining((prev) => {
          if (prev <= 1) {
            clearTimers();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }, warningDelay);

    // Start idle timeout
    timeoutRef.current = setTimeout(() => {
      clearTimers();
      setIsWarning(false);
      onIdle();
    }, timeoutMs);
  }, [enabled, isPaused, timeoutMs, warningMs, onIdle, onWarning, clearTimers]);

  // Pause timer
  const pause = useCallback(() => {
    setIsPaused(true);
    clearTimers();
  }, [clearTimers]);

  // Resume timer
  const resume = useCallback(() => {
    setIsPaused(false);
    reset();
  }, [reset]);

  // Handle activity events
  useEffect(() => {
    if (!enabled) return;

    const handleActivity = () => {
      // Throttle: only reset if enough time has passed since last activity
      const now = Date.now();
      if (now - lastActivityRef.current > 1000) {
        reset();
      }
    };

    // Add event listeners
    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Initial start
    reset();

    return () => {
      // Cleanup
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      clearTimers();
    };
  }, [enabled, reset, clearTimers]);

  return {
    isWarning,
    secondsRemaining,
    reset,
    pause,
    resume,
  };
}

/**
 * Default idle timeout for POS cashier sessions.
 * 5 minutes with 30 second warning.
 */
export const DEFAULT_IDLE_TIMEOUT_MS = 5 * 60 * 1000;
export const DEFAULT_WARNING_MS = 30 * 1000;
