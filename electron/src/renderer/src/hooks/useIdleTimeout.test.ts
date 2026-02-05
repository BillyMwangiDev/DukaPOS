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

    // Advance to warning time (5000 - 2000 = 3000ms)
    act(() => {
      vi.advanceTimersByTime(3000);
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

  it("should expose isWarning state", () => {
    const { result } = renderHook(() =>
      useIdleTimeout({
        timeoutMs: 5000,
        warningMs: 2000,
        onIdle: vi.fn(),
        onWarning: vi.fn(),
        enabled: true,
      })
    );

    expect(result.current.isWarning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(3500); // Plenty of time past threshold
    });

    expect(result.current.isWarning).toBe(true);
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

    // Now advance to trigger
    act(() => {
      vi.advanceTimersByTime(3001);
    });

    expect(onIdle).toHaveBeenCalled();
  });

  it("should track secondsRemaining during warning", () => {
    const { result } = renderHook(() =>
      useIdleTimeout({
        timeoutMs: 5000,
        warningMs: 3000,
        onIdle: vi.fn(),
        onWarning: vi.fn(),
        enabled: true,
      })
    );

    // Advance to warning period
    act(() => {
      vi.advanceTimersByTime(2500); // (5000 - 3000) = 2000 is threshold. 2500 is safely inside.
    });

    // Should be in warning state with seconds remaining
    expect(result.current.isWarning).toBe(true);
    expect(result.current.secondsRemaining).toBeGreaterThan(0);
    expect(result.current.secondsRemaining).toBeLessThanOrEqual(3);
  });
});
