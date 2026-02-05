import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Download,
  Calendar,
  Search,
  ArrowUpDown,
  Banknote,
  Smartphone,
  CreditCard,
  DollarSign,
  Package,
  Receipt,
} from "lucide-react";
import { apiUrl } from "@/lib/api";
import { formatKsh } from "@/lib/format";
import { toast } from "sonner";

// Types matching backend response
interface SoldItemDetail {
  timestamp: string;
  date: string;
  time: string;
  item_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  payment_method: string;
  transaction_id: number;
}

interface DetailedSalesSummary {
  total_revenue: number;
  total_cash: number;
  total_mpesa: number;
  total_credit: number;
  total_items_sold: number;
  transaction_count: number;
}

interface DetailedSalesResponse {
  period: string;
  date: string;
  summary: DetailedSalesSummary;
  items: SoldItemDetail[];
}

type SortField = "time" | "item_name" | "quantity" | "total_price" | "payment_method";
type SortDirection = "asc" | "desc";

function getToday(): string {
  return new Date().toISOString().slice(0, 10);
}

function getCurrentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

export function DetailedReportsScreen() {
  const [period, setPeriod] = useState<"daily" | "monthly">("daily");
  const [selectedDate, setSelectedDate] = useState(getToday);
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth);
  const [report, setReport] = useState<DetailedSalesResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("time");
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const dateParam = period === "daily" ? selectedDate : selectedMonth;
      const res = await fetch(
        apiUrl(`reports/detailed-sales?period=${period}&date=${encodeURIComponent(dateParam)}`)
      );
      if (!res.ok) throw new Error("Failed to load report");
      const data: DetailedSalesResponse = await res.json();
      setReport(data);
    } catch {
      toast.error("Failed to load detailed sales report");
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [period, selectedDate, selectedMonth]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const dateParam = period === "daily" ? selectedDate : selectedMonth;
      const res = await fetch(
        apiUrl(`reports/detailed-sales/export?period=${period}&date=${encodeURIComponent(dateParam)}`)
      );
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `detailed_sales_${period}_${dateParam.replace(/-/g, "_")}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      toast.success("Report exported successfully");
    } catch {
      toast.error("Failed to export report");
    } finally {
      setExporting(false);
    }
  };

  // Handle sort toggle
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter and sort items
  const filteredItems = useMemo(() => {
    if (!report?.items) return [];

    let items = [...report.items];

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter(
        (item) =>
          item.item_name.toLowerCase().includes(q) ||
          item.payment_method.toLowerCase().includes(q) ||
          item.transaction_id.toString().includes(q)
      );
    }

    // Sort
    items.sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case "time":
          cmp = a.timestamp.localeCompare(b.timestamp);
          break;
        case "item_name":
          cmp = a.item_name.localeCompare(b.item_name);
          break;
        case "quantity":
          cmp = a.quantity - b.quantity;
          break;
        case "total_price":
          cmp = a.total_price - b.total_price;
          break;
        case "payment_method":
          cmp = a.payment_method.localeCompare(b.payment_method);
          break;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });

    return items;
  }, [report?.items, searchQuery, sortField, sortDirection]);

  // Payment method icon and badge
  const PaymentBadge = ({ method }: { method: string }) => {
    const m = method.toUpperCase();
    if (m === "CASH") {
      return (
        <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 gap-1">
          <Banknote className="size-3" />
          Cash
        </Badge>
      );
    }
    if (m === "MPESA") {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1">
          <Smartphone className="size-3" />
          M-Pesa
        </Badge>
      );
    }
    if (m === "CREDIT") {
      return (
        <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 gap-1">
          <CreditCard className="size-3" />
          Credit
        </Badge>
      );
    }
    return <Badge variant="outline">{method}</Badge>;
  };

  const SortableHeader = ({
    field,
    children,
  }: {
    field: SortField;
    children: React.ReactNode;
  }) => (
    <TableHead
      className="cursor-pointer select-none hover:bg-muted/50"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={`size-3 ${sortField === field ? "opacity-100" : "opacity-30"}`}
        />
      </div>
    </TableHead>
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Detailed Sales Report</h1>
          <p className="text-muted-foreground mt-1">
            Itemized breakdown of all sales by date and payment method
          </p>
        </div>
        <Button
          onClick={handleExportCsv}
          disabled={exporting || !report?.items?.length}
          className="gap-2"
        >
          <Download className="size-4" />
          {exporting ? "Exporting..." : "Export CSV"}
        </Button>
      </div>

      {/* Controls: Period Toggle + Date Picker */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            {/* Period Toggle */}
            <div className="space-y-2">
              <Label>Report Period</Label>
              <div className="flex rounded-lg border overflow-hidden">
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    period === "daily"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  onClick={() => setPeriod("daily")}
                >
                  Daily
                </button>
                <button
                  type="button"
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    period === "monthly"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted hover:bg-muted/80"
                  }`}
                  onClick={() => setPeriod("monthly")}
                >
                  Monthly
                </button>
              </div>
            </div>

            {/* Date Picker */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1">
                <Calendar className="size-4" />
                {period === "daily" ? "Select Date" : "Select Month"}
              </Label>
              {period === "daily" ? (
                <Input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-48"
                />
              ) : (
                <Input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-48"
                />
              )}
            </div>

            {/* Refresh Button */}
            <Button onClick={fetchReport} disabled={loading} variant="outline">
              {loading ? "Loading..." : "Refresh"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      {report?.summary && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
              <DollarSign className="size-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatKsh(report.summary.total_revenue)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {report.summary.transaction_count} transactions
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Banknote className="size-4 text-blue-500" />
                Cash Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400">
                {formatKsh(report.summary.total_cash)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Smartphone className="size-4 text-emerald-500" />
                M-Pesa Total
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                {formatKsh(report.summary.total_mpesa)}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-1">
                <Package className="size-4 text-muted-foreground" />
                Items Sold
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {report.summary.total_items_sold}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Total quantity sold
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Items Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Receipt className="size-5" />
              Itemized Sales
            </CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              Loading...
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Receipt className="size-12 mb-4 opacity-30" />
              <p>No items found for this period</p>
              {searchQuery && (
                <p className="text-sm mt-1">
                  Try adjusting your search query
                </p>
              )}
            </div>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <SortableHeader field="time">
                      {period === "daily" ? "Time" : "Date/Time"}
                    </SortableHeader>
                    <SortableHeader field="item_name">Item Name</SortableHeader>
                    <SortableHeader field="quantity">Qty</SortableHeader>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <SortableHeader field="total_price">
                      <span className="ml-auto">Amount</span>
                    </SortableHeader>
                    <SortableHeader field="payment_method">Payment</SortableHeader>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredItems.map((item, idx) => (
                    <TableRow key={`${item.transaction_id}-${idx}`}>
                      <TableCell className="font-mono text-sm">
                        {period === "daily" ? item.time : `${item.date} ${item.time}`}
                      </TableCell>
                      <TableCell className="font-medium">{item.item_name}</TableCell>
                      <TableCell className="text-center">{item.quantity}</TableCell>
                      <TableCell className="text-right font-mono">
                        {formatKsh(item.unit_price)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        {formatKsh(item.total_price)}
                      </TableCell>
                      <TableCell>
                        <PaymentBadge method={item.payment_method} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          {filteredItems.length > 0 && (
            <div className="mt-4 text-sm text-muted-foreground text-right">
              Showing {filteredItems.length} of {report?.items?.length || 0} items
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
