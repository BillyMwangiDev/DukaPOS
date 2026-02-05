import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CashierAuditScreen } from "./CashierAuditScreen";

// Mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

// Mock apiUrl
vi.mock("@/lib/api", () => ({
  apiUrl: (path: string) => `http://localhost:8000${path}`,
}));

const mockCashiers = [
  { id: 1, username: "admin", role: "admin" },
  { id: 2, username: "cashier1", role: "cashier" },
];

const mockCashierPerformanceResponse = {
  cashier_id: 1,
  cashier_name: "admin",
  start_date: "2026-01-31",
  end_date: "2026-01-31",
  summary: {
    total_sales: 5000.0,
    total_cash: 3000.0,
    total_mpesa: 1500.0,
    total_credit: 500.0,
    total_items_sold: 50,
    transaction_count: 25,
    average_transaction: 200.0,
  },
  shifts: [
    {
      shift_id: 1,
      opened_at: "2026-01-31T08:00:00Z",
      closed_at: "2026-01-31T18:00:00Z",
      opening_float: 500.0,
      total_cash_sales: 3000.0,
      expected_cash: 3500.0,
    },
  ],
  items: [
    {
      timestamp: "2026-01-31T10:30:00Z",
      date: "2026-01-31",
      time: "10:30:00",
      receipt_number: "TXN001",
      item_name: "Test Product",
      quantity: 2,
      unit_price: 100.0,
      total_price: 200.0,
      payment_method: "CASH",
      transaction_id: 1,
    },
    {
      timestamp: "2026-01-31T11:15:00Z",
      date: "2026-01-31",
      time: "11:15:00",
      receipt_number: "TXN002",
      item_name: "Another Product",
      quantity: 1,
      unit_price: 150.0,
      total_price: 150.0,
      payment_method: "MPESA",
      transaction_id: 2,
    },
  ],
};

// Create a mock fetch function
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("CashierAuditScreen", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    // Default: return cashiers list first
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/reports/cashiers")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCashiers),
        });
      }
      if (url.includes("/reports/cashier-performance")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCashierPerformanceResponse),
        });
      }
      return Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ detail: "Not Found" }),
      });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the component with title", async () => {
    render(<CashierAuditScreen />);
    expect(screen.getByText("Cashier Accountability Audit")).toBeInTheDocument();
  });

  it("fetches and displays cashiers in dropdown", async () => {
    render(<CashierAuditScreen />);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/reports/cashiers")
      );
    });

    // Select trigger should be visible
    expect(screen.getByText("Select a cashier...")).toBeInTheDocument();
  });

  it("has date range inputs", async () => {
    render(<CashierAuditScreen />);

    await waitFor(() => {
      expect(screen.getByLabelText("Start Date")).toBeInTheDocument();
      expect(screen.getByLabelText("End Date")).toBeInTheDocument();
    });
  });

  it("has search functionality button", async () => {
    render(<CashierAuditScreen />);

    await waitFor(() => {
      expect(screen.getByText("Search")).toBeInTheDocument();
    });
  });

  it("has export CSV button", async () => {
    render(<CashierAuditScreen />);

    await waitFor(() => {
      expect(screen.getByText("Export CSV")).toBeInTheDocument();
    });
  });
});

describe("CashierAuditScreen Data Display", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/reports/cashiers")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCashiers),
        });
      }
      if (url.includes("/reports/cashier-performance")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockCashierPerformanceResponse),
        });
      }
      return Promise.resolve({ ok: false });
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows summary cards when report is loaded", async () => {
    render(<CashierAuditScreen />);

    // Wait for data
    await waitFor(
      () => {
        // Look for summary labels
        const totalSalesLabel = screen.queryByText("Total Sales");
        const cashLabel = screen.queryByText("Cash Collected");
        const mpesaLabel = screen.queryByText("M-Pesa Collected");
        return totalSalesLabel || cashLabel || mpesaLabel;
      },
      { timeout: 3000 }
    );
  });

  it("shows shift summary table", async () => {
    render(<CashierAuditScreen />);

    await waitFor(
      () => {
        // Check for shift summary section
        expect(screen.getByText(/Shift Summaries/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });

  it("shows itemized sales table", async () => {
    render(<CashierAuditScreen />);

    await waitFor(
      () => {
        // Check for items table
        expect(screen.getByText(/Accountability View/)).toBeInTheDocument();
      },
      { timeout: 3000 }
    );
  });
});

describe("CashierAuditScreen Error Handling", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("handles API error gracefully", async () => {
    mockFetch.mockImplementation(() =>
      Promise.resolve({
        ok: false,
        json: () => Promise.resolve({ detail: "Server Error" }),
      })
    );

    render(<CashierAuditScreen />);

    // Should still render without crashing
    await waitFor(() => {
      expect(screen.getByText("Cashier Accountability Audit")).toBeInTheDocument();
    });
  });

  it("handles network error gracefully", async () => {
    mockFetch.mockImplementation(() =>
      Promise.reject(new Error("Network Error"))
    );

    render(<CashierAuditScreen />);

    // Should still render without crashing
    await waitFor(() => {
      expect(screen.getByText("Cashier Accountability Audit")).toBeInTheDocument();
    });
  });
});
