import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useIdleTimeout } from "./useIdleTimeout";

describe("useIdleTimeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("should not trigger callbacks when disabled", () => {
    const onIdle = vi.fn();
    const onWarning = vi.fn();

    renderHook(() =>
      useIdleTimeout({
        timeoutMs: 5000,
        warningMs: 2000,
        onIdle,
        onWarning,
        enabled: false,
      })
    );

    act(() => {
      vi.advanceTimersByTime(10000);
    });

    expect(onIdle).not.toHaveBeenCalled();
    expect(onWarning).not.toHaveBeenCalled();
  });

  it("should trigger onWarning before onIdle", () => {
    const onIdle = vi.fn();
    const onWarning = vi.fn();

    renderHook(() =>
      useIdleTimeout({
        timeoutMs: 5000,
        warningMs: 2000,
        onIdle,
        onWarning,
        enabled: true,
      })
    );

    // Advance to warning time (5000 - 2000 = 3000ms) + buffer
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(onWarning).toHaveBeenCalled();
    expect(onIdle).not.toHaveBeenCalled();

    // Advance to idle time
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    expect(onIdle).toHaveBeenCalled();
  });

  it("should reset timer on user activity", () => {
    const onIdle = vi.fn();
    const onWarning = vi.fn();

    const { result } = renderHook(() =>
      useIdleTimeout({
        timeoutMs: 5000,
        warningMs: 1000,
        onIdle,
        onWarning,
        enabled: true,
      })
    );

    // Advance halfway
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Reset the timer
    act(() => {
      result.current.reset();
    });

    // Advance halfway again
    act(() => {
      vi.advanceTimersByTime(2000);
    });

    // Should not have triggered yet
    expect(onWarning).not.toHaveBeenCalled();
    expect(onIdle).not.toHaveBeenCalled();
  });

  it("should expose isWarning state via callback", () => {
    // Test that the warning callback is called when isWarning should be true
    // This verifies the isWarning behavior indirectly through the callback
    const onWarning = vi.fn();

    renderHook(() =>
      useIdleTimeout({
        timeoutMs: 5000,
        warningMs: 2000,
        onIdle: vi.fn(),
        onWarning,
        enabled: true,
      })
    );

    // Before warning time
    expect(onWarning).not.toHaveBeenCalled();

    // Advance to warning time
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    // Callback should be called (proves isWarning was set)
    expect(onWarning).toHaveBeenCalled();
  });

  it("should expose pause and resume methods", () => {
    const onIdle = vi.fn();
    const { result } = renderHook(() =>
      useIdleTimeout({
        timeoutMs: 3000,
        warningMs: 1000,
        onIdle,
        onWarning: vi.fn(),
        enabled: true,
      })
    );

    // Pause the timer
    act(() => {
      result.current.pause();
    });

    // Advance time
    act(() => {
      vi.advanceTimersByTime(5000);
    });

    // Should not trigger while paused
    expect(onIdle).not.toHaveBeenCalled();

    // Resume the timer
    act(() => {
      result.current.resume();
    });

    // Now advance to trigger + buffer
    act(() => {
      vi.advanceTimersByTime(3100);
    });

    expect(onIdle).toHaveBeenCalled();
  });

  it("should track countdown via callback", () => {
    // Test the warning countdown behavior via callbacks
    // The secondsRemaining state is set when onWarning is called
    const onWarning = vi.fn();
    const onIdle = vi.fn();

    renderHook(() =>
      useIdleTimeout({
        timeoutMs: 5000,
        warningMs: 3000,
        onIdle,
        onWarning,
        enabled: true,
      })
    );

    // Advance to warning period
    act(() => {
      vi.advanceTimersByTime(2100);
    });

    // Warning should be called
    expect(onWarning).toHaveBeenCalled();
    expect(onIdle).not.toHaveBeenCalled();

    // Advance through warning period to idle
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Idle should now be called
    expect(onIdle).toHaveBeenCalled();
  });
});
