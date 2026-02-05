import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DetailedReportsScreen } from "./DetailedReportsScreen";

// Mock the API
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock toast
vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Mock API URL helper
vi.mock("@/lib/api", () => ({
  apiUrl: (path: string) => `http://localhost:8000/${path}`,
}));

const mockDetailedSalesResponse = {
  period: "daily",
  date: "2026-02-01",
  summary: {
    total_revenue: 500.0,
    total_cash: 300.0,
    total_mpesa: 200.0,
    total_credit: 0.0,
    total_items_sold: 5,
    transaction_count: 3,
  },
  items: [
    {
      timestamp: "2026-02-01T10:30:00Z",
      date: "2026-02-01",
      time: "10:30:00",
      item_name: "Test Product A",
      quantity: 2,
      unit_price: 100.0,
      total_price: 200.0,
      payment_method: "CASH",
      transaction_id: 1,
    },
    {
      timestamp: "2026-02-01T11:00:00Z",
      date: "2026-02-01",
      time: "11:00:00",
      item_name: "Test Product B",
      quantity: 1,
      unit_price: 100.0,
      total_price: 100.0,
      payment_method: "CASH",
      transaction_id: 2,
    },
    {
      timestamp: "2026-02-01T12:00:00Z",
      date: "2026-02-01",
      time: "12:00:00",
      item_name: "Test Product C",
      quantity: 2,
      unit_price: 100.0,
      total_price: 200.0,
      payment_method: "MPESA",
      transaction_id: 3,
    },
  ],
};

describe("DetailedReportsScreen", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetailedSalesResponse),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders the component with title", async () => {
    render(<DetailedReportsScreen />);
    
    expect(screen.getByText("Detailed Sales Report")).toBeInTheDocument();
    expect(screen.getByText(/Itemized breakdown/)).toBeInTheDocument();
  });

  it("displays period toggle buttons", async () => {
    render(<DetailedReportsScreen />);
    
    expect(screen.getByText("Daily")).toBeInTheDocument();
    expect(screen.getByText("Monthly")).toBeInTheDocument();
  });

  it("fetches and displays summary data", async () => {
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      expect(screen.getByText("Total Sales")).toBeInTheDocument();
      expect(screen.getByText("Cash Total")).toBeInTheDocument();
      expect(screen.getByText("M-Pesa Total")).toBeInTheDocument();
      expect(screen.getByText("Items Sold")).toBeInTheDocument();
    });
  });

  it("displays items table with correct headers", async () => {
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      expect(screen.getByText("Itemized Sales")).toBeInTheDocument();
    });
  });

  it("has Export CSV button", async () => {
    render(<DetailedReportsScreen />);
    
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });

  it("has search input for filtering items", async () => {
    render(<DetailedReportsScreen />);
    
    const searchInput = screen.getByPlaceholderText("Search items...");
    expect(searchInput).toBeInTheDocument();
  });

  it("calls API with correct parameters for daily report", async () => {
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalled();
      const callUrl = mockFetch.mock.calls[0][0];
      expect(callUrl).toContain("reports/detailed-sales");
      expect(callUrl).toContain("period=daily");
    });
  });

  it("switches to monthly view when Monthly button clicked", async () => {
    render(<DetailedReportsScreen />);
    
    const monthlyButton = screen.getByText("Monthly");
    fireEvent.click(monthlyButton);
    
    await waitFor(() => {
      const calls = mockFetch.mock.calls;
      const lastCall = calls[calls.length - 1][0];
      expect(lastCall).toContain("period=monthly");
    });
  });

  it("has refresh button", async () => {
    render(<DetailedReportsScreen />);
    
    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.getByText("Refresh")).toBeInTheDocument();
    });
  });

  it("displays transaction count in summary", async () => {
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      expect(screen.getByText(/3 transactions/)).toBeInTheDocument();
    });
  });
});

describe("DetailedReportsScreen - Data Display", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetailedSalesResponse),
    });
  });

  it("displays item names in the table", async () => {
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      expect(screen.getByText("Test Product A")).toBeInTheDocument();
      expect(screen.getByText("Test Product B")).toBeInTheDocument();
      expect(screen.getByText("Test Product C")).toBeInTheDocument();
    });
  });

  it("displays payment method badges", async () => {
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      // Should have Cash and M-Pesa badges
      expect(screen.getAllByText("Cash").length).toBeGreaterThan(0);
      expect(screen.getAllByText("M-Pesa").length).toBeGreaterThan(0);
    });
  });

  it("shows item count footer", async () => {
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      expect(screen.getByText(/Showing 3 of 3 items/)).toBeInTheDocument();
    });
  });
});

describe("DetailedReportsScreen - Search Functionality", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockDetailedSalesResponse),
    });
  });

  it("filters items by search query", async () => {
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      expect(screen.getByText("Test Product A")).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText("Search items...");
    fireEvent.change(searchInput, { target: { value: "Product A" } });
    
    await waitFor(() => {
      expect(screen.getByText("Test Product A")).toBeInTheDocument();
      expect(screen.queryByText("Test Product B")).not.toBeInTheDocument();
      expect(screen.queryByText("Test Product C")).not.toBeInTheDocument();
    });
  });

  it("filters items by payment method", async () => {
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      expect(screen.getByText("Test Product A")).toBeInTheDocument();
    });
    
    const searchInput = screen.getByPlaceholderText("Search items...");
    fireEvent.change(searchInput, { target: { value: "MPESA" } });
    
    await waitFor(() => {
      expect(screen.getByText("Test Product C")).toBeInTheDocument();
      expect(screen.queryByText("Test Product A")).not.toBeInTheDocument();
    });
  });
});

describe("DetailedReportsScreen - Empty State", () => {
  it("shows empty state message when no items", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        period: "daily",
        date: "2026-02-01",
        summary: {
          total_revenue: 0,
          total_cash: 0,
          total_mpesa: 0,
          total_credit: 0,
          total_items_sold: 0,
          transaction_count: 0,
        },
        items: [],
      }),
    });
    
    render(<DetailedReportsScreen />);
    
    await waitFor(() => {
      expect(screen.getByText("No items found for this period")).toBeInTheDocument();
    });
  });
});

describe("DetailedReportsScreen - Error Handling", () => {
  it("handles API error gracefully", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    });
    
    render(<DetailedReportsScreen />);
    
    // Component should still render without crashing
    await waitFor(() => {
      expect(screen.getByText("Detailed Sales Report")).toBeInTheDocument();
    });
  });
});
