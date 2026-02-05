import "@testing-library/jest-dom";
import { vi } from "vitest";

// Mock ResizeObserver (required by Radix UI)
(globalThis as typeof globalThis & { ResizeObserver: typeof ResizeObserver }).ResizeObserver = class ResizeObserver {
  observe() { }
  unobserve() { }
  disconnect() { }
};

// Mock URL for CSV export
globalThis.URL.createObjectURL = vi.fn(() => "blob:mock-url") as typeof URL.createObjectURL;
globalThis.URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = vi.fn();
window.HTMLElement.prototype.releasePointerCapture = vi.fn();
window.HTMLElement.prototype.hasPointerCapture = vi.fn();

