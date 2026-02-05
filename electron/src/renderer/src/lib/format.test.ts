import { describe, it, expect } from "vitest";
import { formatKsh } from "./format";

describe("formatKsh", () => {
  it("formats zero correctly", () => {
    expect(formatKsh(0)).toBe("Ksh 0.00");
  });

  it("formats positive amounts with comma separators", () => {
    expect(formatKsh(1200)).toBe("Ksh 1,200.00");
  });

  it("formats decimal amounts correctly", () => {
    expect(formatKsh(1234.5)).toBe("Ksh 1,234.50");
  });

  it("formats large amounts correctly", () => {
    expect(formatKsh(1000000)).toBe("Ksh 1,000,000.00");
  });

  it("handles negative amounts", () => {
    expect(formatKsh(-500)).toBe("Ksh -500.00");
  });
});
